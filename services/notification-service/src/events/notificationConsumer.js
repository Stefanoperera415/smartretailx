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
 * ✅ Persist, emit on the bus IMMEDIATELY (so SSE clients get it), then attempt
 *    email delivery. Email failures don't roll back the SSE push.
 */
async function persistAndDeliver(notification) {
  // 1. Persist first so a subsequent GET reflects it.
  await notificationRepo.create(notification);

  // 2. Push to live SSE clients (must be synchronous with the create so the
  //    frontend bell updates the moment the event is processed).
  try {
    notificationBus.emit("created", notification);
    console.log(
      `[SSE] emitted 'created' notification ${notification.notificationId} ` +
        `→ customerId=${notification.customerId}`
    );
  } catch (err) {
    console.error("Bus emit failed:", err.message);
  }

  // 3. Email is best-effort; on failure the notification stays PENDING so an
  //    admin can resend from /admin/notifications.
  const email = await getUserEmail(notification.customerId);
  if (!email) {
    console.warn(
      `No email for customer ${notification.customerId} — notification stays PENDING`
    );
    return notification;
  }

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
      return "SmartRetailX – Order cancelled";
    default:
      return "SmartRetailX notification";
  }
}

async function startNotificationConsumer() {
  console.log("========================================");
  console.log("Starting Notification SQS consumer");
  console.log("Queue:", NOTIFICATION_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

async function pollMessages() {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: NOTIFICATION_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 60,
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

    const supported = [
      "OrderCreated",
      "PaymentCompleted",
      "PaymentFailed",
      "OrderCancelled",
    ];
    if (!supported.includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    const claimed = await markProcessed(eventId, eventType);
    if (!claimed) {
      console.log(`Duplicate event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }
    claimedEventId = eventId;

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

    if (claimedEventId) {
      await unmarkProcessed(claimedEventId);
      console.warn(
        `Claim rolled back for ${claimedEventId} — message will retry`
      );
    }

    console.log("Message will remain in SQS and will be retried.");
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

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

  console.log(`Notification created for PaymentCompleted: ${orderId}`);
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
    type: "ORDER_CANCELLED",
    channel: "EMAIL",
    message: `Your order ${orderId} for ${productSummary} has been cancelled.${reasonText}`,
    metadata: { orderId, reason, items },
    status: "PENDING",
  });

  console.log(`Cancellation notification created for ${orderId}`);
}

async function deleteMessage(message) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: NOTIFICATION_QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startNotificationConsumer };