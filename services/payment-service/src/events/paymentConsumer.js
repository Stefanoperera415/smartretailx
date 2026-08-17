const { getChannel, EXCHANGE_NAME, publishEvent } = require("../config/rabbitmq");
const { hasProcessed, markProcessed } = require("../repositories/processedEventRepository");
const {
  declareResilientQueue,
  parseEvent,
  retryOrDeadLetter
} = require("../messaging/resilience");

function invalidEvent(message) {
  const error = new Error(message);
  error.nonRetryable = true;
  return error;
}

async function startPaymentConsumer() {
  const channel = getChannel();
  await channel.prefetch(1);

  const queue = await declareResilientQueue(
    channel,
    "payment.inventory-reserved",
    EXCHANGE_NAME,
    ["inventoryreserved"]
  );

  await channel.consume(queue.queueName, async (message) => {
    if (!message) return;

    try {
      const event = parseEvent(message);
      if (await hasProcessed(event.eventId)) {
        console.log(`Duplicate payment event ignored: ${event.eventId}`);
        channel.ack(message);
        return;
      }

      const order = event.data;
      if (!order.orderId || !order.customerId || !Number.isFinite(Number(order.totalAmount))) {
        throw invalidEvent("InventoryReserved event is missing required payment data");
      }

      const amount = Number(order.totalAmount);
      const paymentSucceeded = amount < 10000;

      if (paymentSucceeded) {
        publishEvent("PaymentCompleted", {
          orderId: order.orderId,
          customerId: order.customerId,
          amount,
          currency: order.currency || "GBP",
          items: order.items || [],
          warehouseId: order.warehouseId || "WH01"
        });
        console.log(`Payment completed for ${order.orderId}`);
      } else {
        publishEvent("PaymentFailed", {
          orderId: order.orderId,
          customerId: order.customerId,
          amount,
          currency: order.currency || "GBP",
          items: order.items || [],
          warehouseId: order.warehouseId || "WH01",
          reason: "Payment rejected"
        });
        console.log(`Payment failed for ${order.orderId}`);
      }

      await markProcessed(event.eventId, event.eventType);
      channel.ack(message);
    } catch (error) {
      console.error("Payment consumer error:", error.message);
      await retryOrDeadLetter(channel, message, queue, error);
    }
  });

  console.log("Payment consumer started");
}

module.exports = { startPaymentConsumer };
