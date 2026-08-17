const { getChannel, EXCHANGE_NAME } = require("../config/rabbitmq");
const Notification = require("../models/notification");
const { hasProcessed, markProcessed } = require("../service/idempotencyService");
const {
  declareResilientQueue,
  parseEvent,
  retryOrDeadLetter,
  nonRetryableError
} = require("../messaging/resilience");

async function sendNotification(notification) {
  if (process.env.SIMULATE_NOTIFICATION_FAILURE === "true") {
    throw new Error("Simulated notification delivery failure");
  }
  console.log(`Sending ${notification.type} notification to customer ${notification.customerId}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  notification.status = "SENT";
  notification.sentAt = new Date();
  await notification.save();
}

function buildNotification(event) {
  const { orderId, customerId, amount, totalAmount, currency, reason } = event.data;
  if (!orderId || !customerId) throw nonRetryableError("Notification event is missing orderId or customerId");
  const value = amount === undefined ? totalAmount : amount;

  if (event.eventType === "PaymentCompleted") {
    return {
      customerId, type: "PAYMENT_COMPLETED", channel: "EMAIL",
      subject: `Payment Confirmed for Order ${orderId}`,
      message: `Your payment of ${value} ${currency || "GBP"} for order ${orderId} was successfully processed.`,
      metadata: { orderId, amount: value, currency: currency || "GBP", eventId: event.eventId }
    };
  }
  if (event.eventType === "PaymentFailed") {
    return {
      customerId, type: "PAYMENT_FAILED", channel: "EMAIL",
      subject: `Payment Failed for Order ${orderId}`,
      message: `Your payment of ${value} ${currency || "GBP"} for order ${orderId} failed. Reason: ${reason || "Payment rejected"}.`,
      metadata: { orderId, amount: value, currency: currency || "GBP", eventId: event.eventId }
    };
  }
  if (event.eventType === "OrderConfirmed") {
    return {
      customerId, type: "ORDER_CONFIRMED", channel: "EMAIL",
      subject: `Order ${orderId} Confirmed`,
      message: `Your order ${orderId} has been confirmed. Total: ${value} ${currency || "GBP"}.`,
      metadata: { orderId, amount: value, currency: currency || "GBP", eventId: event.eventId }
    };
  }
  if (event.eventType === "OrderFailed") {
    return {
      customerId, type: "ORDER_FAILED", channel: "EMAIL",
      subject: `Order ${orderId} Failed`,
      message: `Your order ${orderId} could not be completed due to an inventory issue.`,
      metadata: { orderId, eventId: event.eventId }
    };
  }
  throw nonRetryableError(`Unsupported notification event type: ${event.eventType}`);
}

async function processNotification(channel, message, queueConfig) {
  try {
    const event = parseEvent(message);
    if (await hasProcessed(event.eventId)) {
      console.log(`Duplicate notification event ignored: ${event.eventId}`);
      channel.ack(message);
      return;
    }

    const payload = buildNotification(event);
    let notification = await Notification.findOne({ eventId: event.eventId });
    if (!notification) {
      notification = await Notification.create({ eventId: event.eventId, ...payload });
    }

    if (notification.status !== "SENT") {
      notification.status = "PENDING";
      await notification.save();
      await sendNotification(notification);
    }

    await markProcessed(event.eventId, event.eventType);
    console.log(`Notification processed: ${event.eventId}`);
    channel.ack(message);
  } catch (error) {
    console.error("Notification consumer error:", error.message);
    await retryOrDeadLetter(channel, message, queueConfig, error);
  }
}

async function startNotificationConsumer() {
  const channel = getChannel();
  await channel.prefetch(1);
  const paymentQueue = await declareResilientQueue(
    channel, "notification.payment-events", EXCHANGE_NAME,
    ["paymentcompleted", "paymentfailed"]
  );
  const orderQueue = await declareResilientQueue(
    channel, "notification.order-events", EXCHANGE_NAME,
    ["orderconfirmed", "orderfailed"]
  );

  await channel.consume(paymentQueue.queueName, (message) =>
    message && processNotification(channel, message, paymentQueue)
  );
  await channel.consume(orderQueue.queueName, (message) =>
    message && processNotification(channel, message, orderQueue)
  );
  console.log("Notification consumers started");
}

module.exports = { startNotificationConsumer };
