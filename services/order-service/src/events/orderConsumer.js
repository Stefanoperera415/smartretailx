require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const orderRepository = require("../repositories/orderRepository");
const {
  hasProcessed,
  markProcessed,
} = require("../service/idempotencyService");
const { publishEvent } = require("../config/eventbridge"); // ✅ consolidated

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL;
if (!ORDER_QUEUE_URL) {
  throw new Error("ORDER_QUEUE_URL is not defined");
}

// ==========================================
// Start Order SQS Consumer
// ==========================================
async function startOrderConsumer() {
  console.log("========================================");
  console.log("Starting Order SQS consumer");
  console.log("Queue:", ORDER_QUEUE_URL);
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
        QueueUrl: ORDER_QUEUE_URL,
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
// Process Message
// ==========================================
async function processMessage(message) {
  try {
    console.log("----------------------------------------");
    console.log("Received SQS message");

    const event = JSON.parse(message.Body);
    console.log("Raw EventBridge event:", JSON.stringify(event, null, 2));

    // Extract event details from EventBridge envelope
    const eventType =
      event["detail-type"] || event.detailType || event.eventType;
    const detail = event.detail;
    if (!detail) {
      throw new Error("EventBridge message missing 'detail' field");
    }

    const eventId = detail.eventId;
    const data = detail.data || {};

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");

    console.log("Event type:", eventType);
    console.log("Event data:", JSON.stringify(data, null, 2));

    // ==========================================
    // IDEMPOTENCY CHECK
    // ==========================================
    if (await hasProcessed(eventId)) {
      console.log(`Duplicate event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }

    // ==========================================
    // HANDLE SUPPORTED EVENT TYPES
    // ==========================================
    let handled = false;

    if (eventType === "InventoryReservationFailed") {
      await handleInventoryReservationFailed(data);
      handled = true;
    } else if (eventType === "PaymentCompleted") {
      await handlePaymentCompleted(data);
      handled = true;
    } else if (eventType === "PaymentFailed") {
      await handlePaymentFailed(data);
      handled = true;
    } else {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      // Unsupported events – delete and don't mark processed
      await deleteMessage(message);
      return;
    }

    // ==========================================
    // Mark processed and delete
    // ==========================================
    if (handled) {
      await markProcessed(eventId, eventType);
      await deleteMessage(message);
      console.log("SQS message deleted successfully");
    }

    console.log("----------------------------------------");
  } catch (error) {
    console.error("Order SQS message processing failed:", error);
    // Do NOT delete – SQS will retry
    console.error("Message will remain in SQS and may be retried.");
  }
}

// ==========================================
// Event Handlers
// ==========================================

async function handleInventoryReservationFailed(data) {
  const { orderId, reason } = data;
  if (!orderId) {
    throw new Error("InventoryReservationFailed missing orderId");
  }
  console.log(`Processing InventoryReservationFailed for ${orderId}`);
  await orderRepository.updateStatus(orderId, "CANCELLED");
  console.log(
    `Order ${orderId} cancelled because inventory failed: ${reason || "Unknown reason"}`,
  );
}

async function handlePaymentCompleted(data) {
  const { orderId } = data;
  if (!orderId) {
    throw new Error("PaymentCompleted missing orderId");
  }
  console.log(`Processing PaymentCompleted for ${orderId}`);
  await orderRepository.updateStatus(orderId, "CONFIRMED");
  console.log(`Order ${orderId} confirmed`);
}

async function handlePaymentFailed(data) {
  const { orderId, customerId, items, warehouseId } = data;
  if (!orderId) {
    throw new Error("PaymentFailed missing orderId");
  }

  console.log(`Processing PaymentFailed for ${orderId}`);

  // 1. Update order status
  await orderRepository.updateStatus(orderId, "PAYMENT_FAILED");
  console.log(`Order ${orderId} marked as PAYMENT_FAILED`);

  // 2. Publish compensation event – defensive
  let itemsArray = Array.isArray(items) ? items : [];
  if (itemsArray.length === 0) {
    console.warn(
      `PaymentFailed for ${orderId} has no items array – publishing empty list`,
    );
  }

  const whId = warehouseId || "WH01";
  if (!warehouseId) {
    console.warn(
      `PaymentFailed for ${orderId} missing warehouseId – defaulting to WH01`,
    );
  }

  await publishEvent("ReleaseInventory", {
    orderId,
    customerId: customerId || "unknown",
    items: itemsArray,
    warehouseId: whId,
  });

  console.log(`ReleaseInventory published for ${orderId}`);
}

// ==========================================
// Helpers
// ==========================================

async function deleteMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: ORDER_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  });
  await sqs.send(command);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startOrderConsumer };
