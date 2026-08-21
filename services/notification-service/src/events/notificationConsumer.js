require("dotenv").config();

const { ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { sqs, NOTIFICATION_QUEUE_URL } = require("../config/sqs");
const notificationRepo = require("../repositories/notificationRepository");
const { hasProcessed, markProcessed } = require("../service/idempotencyService");

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
  try {
    console.log("----------------------------------------");
    console.log("Received Notification SQS message");

    // 1) Parse the SQS body (EventBridge envelope)
    const rawEvent = JSON.parse(message.Body);
    console.log("Raw EventBridge event:", JSON.stringify(rawEvent, null, 2));

    // 2) Extract the event from the "detail" field
    const detail = rawEvent.detail;
    if (!detail) throw new Error("EventBridge message missing 'detail' field");

    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object") throw new Error("Event missing data");

    console.log("Event type:", eventType);

    // 3) Handle supported event types
    if (eventType === "OrderCreated") {
      await handleOrderCreated(data, eventId, eventType);
    } else if (eventType === "PaymentCompleted") {
      await handlePaymentCompleted(data, eventId, eventType);
    } else if (eventType === "PaymentFailed") {
      await handlePaymentFailed(data, eventId, eventType);
    } else {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    // 4) Mark as processed (idempotency)
    await markProcessed(eventId, eventType);

    // 5) Delete the SQS message
    await deleteMessage(message);
    console.log("Notification SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Notification consumer error:", error);
    // Do NOT delete the message – SQS will retry after visibility timeout
    console.error("Message will remain in SQS and will be retried.");
  }
}

// ==========================================
// Handle OrderCreated
// ==========================================
async function handleOrderCreated(data, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate event ignored: ${eventId}`);
    return;
  }

  const { orderId, customerId, totalAmount, currency } = data;
  if (!orderId || !customerId) {
    throw new Error("OrderCreated missing orderId or customerId");
  }

  const notification = {
    notificationId: `NOTIF${Date.now()}`,
    eventId,
    customerId,
    type: "ORDER_CREATED",
    channel: "EMAIL",
    message: `Your order ${orderId} has been created. Total: ${totalAmount} ${currency || "GBP"}.`,
    metadata: { orderId, totalAmount, currency },
    status: "PENDING",
  };

  await notificationRepo.create(notification);
  console.log(`Notification created for OrderCreated: ${orderId}`);
}

// ==========================================
// Handle PaymentCompleted
// ==========================================
async function handlePaymentCompleted(data, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate event ignored: ${eventId}`);
    return;
  }

  const { orderId, customerId, amount, currency } = data;
  if (!orderId || !customerId) {
    throw new Error("PaymentCompleted missing orderId or customerId");
  }

  const notification = {
    notificationId: `NOTIF${Date.now()}`,
    eventId,
    customerId,
    type: "PAYMENT_COMPLETED",
    channel: "EMAIL",
    message: `Your payment of ${amount} ${currency || "GBP"} for order ${orderId} was successful.`,
    metadata: { orderId, amount, currency },
    status: "PENDING",
  };

  await notificationRepo.create(notification);
  console.log(`Notification created for PaymentCompleted: ${orderId}`);
}

// ==========================================
// Handle PaymentFailed
// ==========================================
async function handlePaymentFailed(data, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate event ignored: ${eventId}`);
    return;
  }

  const { orderId, customerId, amount, currency, reason } = data;
  if (!orderId || !customerId) {
    throw new Error("PaymentFailed missing orderId or customerId");
  }

  const notification = {
    notificationId: `NOTIF${Date.now()}`,
    eventId,
    customerId,
    type: "PAYMENT_FAILED",
    channel: "EMAIL",
    message: `Your payment of ${amount} ${currency || "GBP"} for order ${orderId} failed. Reason: ${reason || "Payment rejected"}.`,
    metadata: { orderId, amount, currency, reason },
    status: "PENDING",
  };

  await notificationRepo.create(notification);
  console.log(`Notification created for PaymentFailed: ${orderId}`);
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