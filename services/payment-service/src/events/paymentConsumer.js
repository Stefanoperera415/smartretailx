require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const database = require("../config/database");
const outboxRepo = require("../repositories/outboxRepository");
const { processPayment } = require("../services/stripe");

const USE_STRIPE =
  process.env.USE_STRIPE === "true" && process.env.STRIPE_SECRET_KEY;

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const PAYMENT_QUEUE_URL = process.env.PAYMENT_QUEUE_URL;
if (!PAYMENT_QUEUE_URL) throw new Error("PAYMENT_QUEUE_URL is not defined");

async function startPaymentConsumer() {
  console.log("========================================");
  console.log("Starting Payment SQS consumer");
  console.log("Queue:", PAYMENT_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

async function pollMessages() {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: PAYMENT_QUEUE_URL,
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
    console.log("Received Payment SQS message");

    const rawEvent = JSON.parse(message.Body);
    const detail = rawEvent.detail;
    if (!detail) throw new Error("EventBridge message missing 'detail' field");

    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object") throw new Error("Event missing data");

    console.log("Event type:", eventType);

    if (eventType !== "InventoryReserved") {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    const claimed = await claimEvent(eventId, eventType);
    if (!claimed) {
      console.log(`Duplicate payment event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }

    const order = data;
    if (!order.orderId || !order.customerId || !Number.isFinite(Number(order.totalAmount))) {
      throw new Error("InventoryReserved event missing required payment data");
    }

    if (USE_STRIPE) {
      console.log(`Stripe mode enabled — skipping automatic payment for order ${order.orderId}`);
      await deleteMessage(message);
      return;
    }

    // Mock mode — process automatically.
    const amount = Number(order.totalAmount);
    const currency = order.currency || "GBP";

    const paymentResult = await processPayment({
      orderId: order.orderId,
      customerId: order.customerId,
      amount,
      currency,
      items: Array.isArray(order.items) ? order.items : [],
      warehouseId: order.warehouseId || "WH01",
    });

    // Write outcome to outbox atomically with the event id marker.
    const pool = database.pool;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (paymentResult.success) {
        await outboxRepo.enqueue(
          client,
          `pay-complete-${order.orderId}`,
          "PaymentCompleted",
          {
            orderId: order.orderId,
            customerId: order.customerId,
            amount,
            currency,
            items: order.items || [],
            warehouseId: order.warehouseId || "WH01",
            warehouseMapping: order.warehouseMapping || null,
            transactionRef: paymentResult.transactionRef,
          }
        );
      } else {
        await outboxRepo.enqueue(
          client,
          `pay-fail-${order.orderId}`,
          "PaymentFailed",
          {
            orderId: order.orderId,
            customerId: order.customerId,
            amount,
            currency,
            items: order.items || [],
            warehouseId: order.warehouseId || "WH01",
            warehouseMapping: order.warehouseMapping || null,
            reason: paymentResult.reason || "Payment failed",
            transactionRef: paymentResult.transactionRef,
          }
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    await deleteMessage(message);
    console.log("Payment SQS message processed");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Payment consumer error:", error);
    console.error("Message will remain in SQS and will be retried.");
  }
}

async function deleteMessage(message) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: PAYMENT_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  }));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { startPaymentConsumer };