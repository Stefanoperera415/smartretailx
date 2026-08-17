const {
  getChannel,
  EXCHANGE_NAME
} = require("../config/rabbitmq");

const orderRepository =
  require("../repositories/orderRepository");

async function startOrderConsumer() {
  const channel = getChannel();

  // ==========================================
  // QUEUES
  // ==========================================

  const inventoryFailureQueue =
    await channel.assertQueue(
      "order.inventory-failure",
      {
        durable: true
      }
    );

  const paymentCompletedQueue =
    await channel.assertQueue(
      "order.payment-completed",
      {
        durable: true
      }
    );

  const paymentFailedQueue =
    await channel.assertQueue(
      "order.payment-failed",
      {
        durable: true
      }
    );

  // ==========================================
  // BINDINGS
  // ==========================================

  await channel.bindQueue(
    inventoryFailureQueue.queue,
    EXCHANGE_NAME,
    "inventoryreservationfailed"
  );

  await channel.bindQueue(
    paymentCompletedQueue.queue,
    EXCHANGE_NAME,
    "paymentcompleted"
  );

  await channel.bindQueue(
    paymentFailedQueue.queue,
    EXCHANGE_NAME,
    "paymentfailed"
  );

  console.log(
    "Order Saga consumers started"
  );

  // ==========================================
  // INVENTORY RESERVATION FAILED
  // ==========================================

  await channel.consume(
    inventoryFailureQueue.queue,
    async (message) => {
      if (!message) return;

      try {
        const event = JSON.parse(
          message.content.toString()
        );

        const {
          orderId,
          reason
        } = event.data;

        console.log(
          `Processing InventoryReservationFailed for ${orderId}`
        );

        await orderRepository.updateStatus(
          orderId,
          "CANCELLED"
        );

        console.log(
          `Order ${orderId} cancelled because inventory failed: ${
            reason || "Unknown reason"
          }`
        );

        channel.ack(message);

      } catch (error) {
        console.error(
          "Inventory failure consumer error:",
          error
        );

        channel.nack(
          message,
          false,
          false
        );
      }
    }
  );

  // ==========================================
  // PAYMENT COMPLETED
  // ==========================================

  await channel.consume(
    paymentCompletedQueue.queue,
    async (message) => {
      if (!message) return;

      try {
        const event = JSON.parse(
          message.content.toString()
        );

        const {
          orderId
        } = event.data;

        console.log(
          `Processing PaymentCompleted for ${orderId}`
        );

        await orderRepository.updateStatus(
          orderId,
          "CONFIRMED"
        );

        console.log(
          `Order ${orderId} confirmed`
        );

        channel.ack(message);

      } catch (error) {
        console.error(
          "Payment completed consumer error:",
          error
        );

        channel.nack(
          message,
          false,
          false
        );
      }
    }
  );

  // ==========================================
  // PAYMENT FAILED
  // ==========================================

  await channel.consume(
    paymentFailedQueue.queue,
    async (message) => {
      if (!message) return;

      try {
        const event = JSON.parse(
          message.content.toString()
        );

        const {
          orderId,
          customerId,
          items,
          warehouseId
        } = event.data;

        console.log(
          `Processing PaymentFailed for ${orderId}`
        );

        // ------------------------------------------
        // 1. Update order status
        // ------------------------------------------

        await orderRepository.updateStatus(
          orderId,
          "PAYMENT_FAILED"
        );

        console.log(
          `Order ${orderId} marked as PAYMENT_FAILED`
        );

        // ------------------------------------------
        // 2. Publish compensation command
        // ------------------------------------------

        const releaseInventoryEvent = {
          eventId:
            `evt-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 8)}`,

          eventType:
            "ReleaseInventory",

          source:
            "order-service",

          timestamp:
            new Date().toISOString(),

          data: {
            orderId,
            customerId,

            items:
              Array.isArray(items)
                ? items
                : [],

            warehouseId:
              warehouseId || "WH01"
          }
        };

        channel.publish(
          EXCHANGE_NAME,
          "releaseinventory",
          Buffer.from(
            JSON.stringify(
              releaseInventoryEvent
            )
          ),
          {
            persistent: true,
            contentType:
              "application/json"
          }
        );

        console.log(
          `ReleaseInventory published for ${orderId}`
        );

        // ------------------------------------------
        // 3. Acknowledge PaymentFailed
        // ------------------------------------------

        channel.ack(message);

      } catch (error) {
        console.error(
          "Payment failed consumer error:",
          error
        );

        channel.nack(
          message,
          false,
          false
        );
      }
    }
  );
}

module.exports = {
  startOrderConsumer
};