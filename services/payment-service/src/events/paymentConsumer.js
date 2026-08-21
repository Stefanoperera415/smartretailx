require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const { publishEvent } = require("../config/eventbridge");
const { hasProcessed, markProcessed } = require("../repositories/processedEventRepository");
const { processPayment } = require("../services/stripe"); // new service

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const PAYMENT_QUEUE_URL = process.env.PAYMENT_QUEUE_URL;
if (!PAYMENT_QUEUE_URL) throw new Error("PAYMENT_QUEUE_URL is not defined");

// ----------------------------------------------------------------------
// Start Consumer
// ----------------------------------------------------------------------
async function startPaymentConsumer() {
  console.log("========================================");
  console.log("Starting Payment SQS consumer");
  console.log("Queue:", PAYMENT_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

// ----------------------------------------------------------------------
// Poll SQS (long polling)
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// Process Individual Message
// ----------------------------------------------------------------------
async function processMessage(message) {
  try {
    console.log("----------------------------------------");
    console.log("Received Payment SQS message");

    // 1) Parse the SQS body (which is the EventBridge event)
    const rawEvent = JSON.parse(message.Body);
    console.log("Raw EventBridge event:", JSON.stringify(rawEvent, null, 2));

    // 2) Extract the actual event from the EventBridge envelope
    //    EventBridge puts your custom event inside the "detail" field.
    const detail = rawEvent.detail;
    if (!detail) {
      throw new Error("EventBridge message missing 'detail' field");
    }

    // 3) Now we have the original event that was published
    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object") throw new Error("Event missing data");

    console.log("Event type:", eventType);

    // 4) Only handle InventoryReserved events
    if (eventType !== "InventoryReserved") {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    // 5) Idempotency – skip if already processed
    if (await hasProcessed(eventId)) {
      console.log(`Duplicate payment event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }

    // 6) Validate order data
    const order = data;
    if (!order.orderId || !order.customerId || !Number.isFinite(Number(order.totalAmount))) {
      throw new Error("InventoryReserved event missing required payment data");
    }

    const amount = Number(order.totalAmount);
    const currency = order.currency || "GBP";

    console.log(`Processing payment for order ${order.orderId}, amount ${amount} ${currency}`);

    // 7) Process the payment (Stripe or mock)
    const paymentResult = await processPayment({
      orderId: order.orderId,
      customerId: order.customerId,
      amount,
      currency,
      items: Array.isArray(order.items) ? order.items : [],
      warehouseId: order.warehouseId || "WH01",
    });

    // 8) Publish outcome event
    if (paymentResult.success) {
      await publishEvent("PaymentCompleted", {
        orderId: order.orderId,
        customerId: order.customerId,
        amount,
        currency,
        items: order.items || [],
        warehouseId: order.warehouseId || "WH01",
        transactionRef: paymentResult.transactionRef, // Stripe payment intent ID
      });
      console.log(`PaymentCompleted published for ${order.orderId}`);
    } else {
      await publishEvent("PaymentFailed", {
        orderId: order.orderId,
        customerId: order.customerId,
        amount,
        currency,
        items: order.items || [],
        warehouseId: order.warehouseId || "WH01",
        reason: paymentResult.reason || "Payment failed",
        transactionRef: paymentResult.transactionRef, // might be null
      });
      console.log(`PaymentFailed published for ${order.orderId}`);
    }

    // 9) Mark as processed
    await markProcessed(eventId, eventType);

    // 10) Delete the SQS message
    await deleteMessage(message);
    console.log("Payment SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Payment consumer error:", error);
    // Do NOT delete the message – SQS will retry after visibility timeout
    console.error("Message will remain in SQS and will be retried.");
  }
}

// ----------------------------------------------------------------------
// Delete Message
// ----------------------------------------------------------------------
async function deleteMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: PAYMENT_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  });
  await sqs.send(command);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startPaymentConsumer };