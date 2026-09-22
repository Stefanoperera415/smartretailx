require("dotenv").config();

const {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { sqs, NOTIFICATION_QUEUE_URL } = require("../config/sqs");
const notificationRepo = require("../repositories/notificationRepository");
const {
  markProcessed,
  unmarkProcessed,
} = require("../service/idempotencyService");
const notificationBus = require("./notificationBus");
const { sendEmail } = require("../service/emailService");
const { getUserEmail } = require("../clients/userServiceClient");

// ==========================================
// Helpers
// =====================c=====================
function buildProductSummary(items = []) {
  const names = items
    .map((i) => i.productName || i.name)
    .filter((n) => typeof n === "string" && n.trim().length > 0);
  if (names.length === 0) return "your order";
  if (names.length === 1) return `"${names[0]}"`;
  return names.map((n) => `"${n}"`).join(", ");
}

function generateNotificationId() {
  return `NOTIF${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save the notification, publish it on the bus, then try to email it.
 * Marked SENT on successful delivery; left PENDING on failure so an admin
 * can trigger a resend from /admin/notifications.
 */
async function persistAndDeliver(notification) {
  await notificationRepo.create(notification);

  // Live push to any open SSE clients
  try {
    notificationBus.emit("created", notification);
  } catch (err) {
    console.error("Bus emit failed:", err.message);
  }

  // Look up the user's email
  const email = await getUserEmail(notification.customerId);
  if (!email) {
    console.warn(
      `No email found for customer ${notification.customerId} – notification stays PENDING`
    );
    return notification;
  }

  // Attempt delivery
  const subject = subjectForType(notification.type);
  const result = await sendEmail({
    to: email,
    subject,
    text: notification.message,
  });

  if (result.success) {
    try {
      const updated = await notificationRepo.updateStatus(
        notification.notificationId,
        "SENT",
        { sentAt: new Date().toISOString(), messageId: result.messageId }
      );
      notificationBus.emit("updated", updated);
    } catch (err) {
      console.error("Failed to mark notification SENT:", err.message);
    }
  } else {
    try {
      const updated = await notificationRepo.updateStatus(
        notification.notificationId,
        "PENDING",
        { lastError: result.reason || "Delivery failed" }
      );
      notificationBus.emit("updated", updated);
    } catch (err) {
      console.error("Failed to record delivery failure:", err.message);
    }
  }

  return notification;
}

function subjectForType(type) {
  switch (type) {
    case "ORDER_CREATED":
      return "SmartRetailX – Order created";
    case "PAYMENT_COMPLETED":
      return "SmartRetailX – Payment confirmed";
    case "PAYMENT_FAILED":
      return "SmartRetailX – Payment failed";
    case "ORDER_CANCELLED":
      return "SmartRetailX – Order cancelled";   // ✅ NEW
    default:
      return "SmartRetailX notification";
  }
}

// ==========================================
// Start SQS Consumer
// ==========================================
async function startNotificationConsumer() {
  console.log("========================================");
  console.log("Starting Notification SQS consumer");
  console.log("Queue:", NOTIFICATION_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

// ==========================================
// Poll SQS (long polling)
// ==========================================
async function pollMessages() {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: NOTIFICATION_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 30,
        MessageAttributeNames: ["All"],
      });
      const response = await sqs.send(command);
      const messages = response.Messages || [];
      if (messages.length === 0) continue;
      for (const message of messages) {
        await processMessage(message);
      }
    } catch (error) {
      console.error("SQS polling error:", error);
      await sleep(5000);
    }
  }
}

// ==========================================
// Process Individual Message
// ==========================================
async function processMessage(message) {
  let claimedEventId = null;

  try {
    console.log("----------------------------------------");
    console.log("Received Notification SQS message");

    const rawEvent = JSON.parse(message.Body);
    const detail = rawEvent.detail;
    if (!detail) throw new Error("EventBridge message missing 'detail' field");

    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object")
      throw new Error("Event missing data");

    console.log("Event type:", eventType, "id:", eventId);

    // Reject unsupported event types up front — no claim needed.
    const supported = ["OrderCreated", "PaymentCompleted", "PaymentFailed", "OrderCancelled"];
    if (!supported.includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    // ✅ CLAIM FIRST — atomic conditional write closes the race between
    //    concurrent SQS deliveries of the same message.
    const claimed = await markProcessed(eventId, eventType);
    if (!claimed) {
      console.log(`Duplicate event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }
    claimedEventId = eventId;

    // Dispatch — handlers no longer check hasProcessed (we own the claim).
    if (eventType === "OrderCreated") {
      await handleOrderCreated(data);
    } else if (eventType === "PaymentCompleted") {
      await handlePaymentCompleted(data);
    } else if (eventType === "PaymentFailed") {
      await handlePaymentFailed(data);
    } else if (eventType === "OrderCancelled") {
      await handleOrderCancelled(data);
    }

    await deleteMessage(message);
    console.log("Notification SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Notification consumer error:", error);

    // ✅ Roll back the claim so SQS redelivery retries the handler.
    if (claimedEventId) {
      await unmarkProcessed(claimedEventId);
      console.warn(`Claim rolled back for ${claimedEventId} — message will retry`);
    }

    console.log("Message will remain in SQS and will be retried.");
  }
}

// ==========================================
// Handlers
// ==========================================

async function handleOrderCreated(data) {
  const { orderId, customerId, totalAmount, currency, items = [] } = data;
  if (!orderId || !customerId) {
    throw new Error("OrderCreated missing orderId or customerId");
  }

  const productSummary = buildProductSummary(items);

  await persistAndDeliver({
    notificationId: generateNotificationId(),
    customerId,
    type: "ORDER_CREATED",
    channel: "EMAIL",
    message: `Your order ${orderId} for ${productSummary} has been created. Total: ${totalAmount} ${currency || "GBP"}.`,
    metadata: { orderId, totalAmount, currency, items },
    status: "PENDING",
  });

  console.log(`Notification created for OrderCreated: ${orderId}`);
}

async function handlePaymentCompleted(data) {
  const { orderId, customerId, amount, currency, items = [] } = data;
  if (!orderId || !customerId) {
    throw new Error("PaymentCompleted missing orderId or customerId");
  }

  const productSummary = buildProductSummary(items);

  await persistAndDeliver({
    notificationId: generateNotificationId(),
    customerId,
    type: "PAYMENT_COMPLETED",
    channel: "EMAIL",
    message:
      `Payment of ${amount} ${currency || "GBP"} for order ${orderId} was successful. ` +
      `Your ${productSummary} will be delivered shortly.`,
    metadata: { orderId, amount, currency, items },
    status: "PENDING",
  });

  console.log(
    `Notification created for PaymentCompleted: ${orderId} → "${productSummary}"`
  );
}

async function handlePaymentFailed(data) {
  const { orderId, customerId, amount, currency, reason, items = [] } = data;
  if (!orderId || !customerId) {
    throw new Error("PaymentFailed missing orderId or customerId");
  }

  const productSummary = buildProductSummary(items);

  await persistAndDeliver({
    notificationId: generateNotificationId(),
    customerId,
    type: "PAYMENT_FAILED",
    channel: "EMAIL",
    message:
      `Your payment of ${amount} ${currency || "GBP"} for order ${orderId} ` +
      `(${productSummary}) failed. Reason: ${reason || "Payment rejected"}.`,
    metadata: { orderId, amount, currency, reason, items },
    status: "PENDING",
  });

  console.log(`Notification created for PaymentFailed: ${orderId}`);
}

/**
 * Single cancellation handler for every failure path:
 * inventory unavailable, payment failure, admin cancel, saga timeout.
 * Order-service converges all of these into a single OrderCancelled event.
 */
async function handleOrderCancelled(data) {
  const { orderId, customerId, reason, items = [] } = data;
  if (!orderId || !customerId) {
    throw new Error("OrderCancelled missing orderId or customerId");
  }

  const productSummary = buildProductSummary(items);
  const reasonText = reason ? ` Reason: ${reason}.` : "";

  await persistAndDeliver({
    notificationId: generateNotificationId(),
    customerId,
    type: "ORDER_CANCELLED", // ✅ proper type instead of PAYMENT_FAILED
    channel: "EMAIL",
    message:
      `Your order ${orderId} for ${productSummary} has been cancelled.${reasonText}`,
    metadata: { orderId, reason, items },
    status: "PENDING",
  });

  console.log(`Cancellation notification created for ${orderId}`);
}

// ==========================================
// Delete SQS Message
// ==========================================
async function deleteMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: NOTIFICATION_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  });
  await sqs.send(command);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startNotificationConsumer };