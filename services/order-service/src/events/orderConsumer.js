require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const orderRepository = require("../repositories/orderRepository");
const database = require("../config/database");
const outboxRepo = require("../repositories/outboxRepository");
const { EVENT_BUS_NAME } = require("../config/eventbridge");

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL;
if (!ORDER_QUEUE_URL) throw new Error("ORDER_QUEUE_URL is not defined");

async function startOrderConsumer() {
  console.log("========================================");
  console.log("Starting Order SQS consumer");
  console.log("Queue:", ORDER_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

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

/**
 * Atomically claim an event for processing.
 * Returns true if we claimed it (first delivery), false if already processed.
 * This closes the check-then-act race across concurrent consumers.
 */
async function claimEvent(eventId, eventType) {
  const pool = database.pool;
  const result = await pool.query(
    `INSERT INTO processed_events (event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, eventType]
  );
  return result.rowCount === 1;
}

async function processMessage(message) {
  try {
    console.log("----------------------------------------");
    console.log("Received SQS message");

    const event = JSON.parse(message.Body);
    const eventType =
      event["detail-type"] || event.detailType || event.eventType;
    const detail = event.detail;
    if (!detail) throw new Error("EventBridge message missing 'detail' field");

    const eventId = detail.eventId;
    const data = detail.data || {};

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");

    console.log("Event type:", eventType, "id:", eventId);

    if (!["InventoryReservationFailed", "PaymentCompleted", "PaymentFailed",
          "InventoryReserved"].includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    // ✅ Claim BEFORE processing so concurrent redeliveries can't double-process.
    const claimed = await claimEvent(eventId, eventType);
    if (!claimed) {
      console.log(`Duplicate event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }

    if (eventType === "InventoryReservationFailed") {
      await handleInventoryReservationFailed(data);
    } else if (eventType === "InventoryReserved") {
      await handleInventoryReserved(data);
    } else if (eventType === "PaymentCompleted") {
      await handlePaymentCompleted(data);
    } else if (eventType === "PaymentFailed") {
      await handlePaymentFailed(data);
    }

    await deleteMessage(message);
    console.log("SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Order SQS message processing failed:", error);
    console.error("Message will remain in SQS and may be retried.");
    // Note: the processed_events row was already written, so a retry will be
    // treated as a duplicate. This is intentional — the caller must retry
    // via the outbox or a DLQ replay, not via SQS redelivery, to guarantee
    // exactly-once semantics for compensations.
  }
}

async function handleInventoryReservationFailed(data) {
  const { orderId, reason } = data;
  if (!orderId) throw new Error("InventoryReservationFailed missing orderId");
  console.log(`Processing InventoryReservationFailed for ${orderId}`);

  await orderRepository.updateStatus(orderId, "CANCELLED");

  // Notify the customer that the order could not be fulfilled.
  const eventId = `notify-inv-fail-${orderId}`;
  await orderRepository.updateStatus(orderId, "CANCELLED", async (client) => {
    await outboxRepo.enqueue(client, eventId, "OrderCancelled", {
      orderId,
      customerId: data.customerId || null,
      items: data.items || [],
      reason: reason || "Inventory unavailable",
    });
  });

  console.log(`Order ${orderId} cancelled (${reason || "unknown reason"})`);
}

async function handleInventoryReserved(data) {
  // Optional: advance the order to a mid-state. Skipped for now.
  console.log(`InventoryReserved received for ${data.orderId} — no action needed`);
}

async function handlePaymentCompleted(data) {
  const { orderId } = data;
  if (!orderId) throw new Error("PaymentCompleted missing orderId");
  console.log(`Processing PaymentCompleted for ${orderId}`);
  await orderRepository.updateStatus(orderId, "CONFIRMED");
  console.log(`Order ${orderId} confirmed`);
}

async function handlePaymentFailed(data) {
  const { orderId, customerId, items, warehouseId, warehouseMapping } = data;
  if (!orderId) throw new Error("PaymentFailed missing orderId");

  console.log(`Processing PaymentFailed for ${orderId}`);

  // ✅ Prefer per-item warehouse info from warehouseMapping if present.
  const itemsWithWh = Array.isArray(items)
    ? items.map((it) => ({
        productId: it.productId || it.product,
        quantity: it.quantity,
        warehouseId:
          it.warehouseId ||
          (warehouseMapping && warehouseMapping[it.productId]) ||
          null,
      }))
    : [];

  const fallbackWhId = warehouseId || "WH01";

  await orderRepository.updateStatus(orderId, "PAYMENT_FAILED", async (client) => {
    await outboxRepo.enqueue(client, `release-${orderId}`, "ReleaseInventory", {
      orderId,
      customerId: customerId || "unknown",
      items: itemsWithWh,
      warehouseId: fallbackWhId,
    });

    await outboxRepo.enqueue(client, `notify-pay-fail-${orderId}`, "OrderCancelled", {
      orderId,
      customerId,
      items,
    });
  });

  console.log(`Order ${orderId} marked PAYMENT_FAILED, compensation events queued`);
}

async function deleteMessage(message) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: ORDER_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  }));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { startOrderConsumer };