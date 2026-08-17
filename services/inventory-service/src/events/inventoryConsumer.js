const { getChannel, EXCHANGE_NAME, publishEvent } = require("../config/rabbitmq");
const { reserveStock, releaseStock } = require("../service/inventoryService");
const { hasProcessed, markProcessed } = require("../service/idempotencyService");
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

async function startInventoryConsumer() {
  const channel = getChannel();
  await channel.prefetch(1);

  const orderQueue = await declareResilientQueue(
    channel,
    "inventory.order-created",
    EXCHANGE_NAME,
    ["ordercreated"]
  );

  const releaseQueue = await declareResilientQueue(
    channel,
    "inventory.release",
    EXCHANGE_NAME,
    ["releaseinventory"]
  );

  await channel.consume(orderQueue.queueName, async (message) => {
    if (!message) return;

    try {
      const event = parseEvent(message);

      //Temporary DLQ for testing, remove after testing
      //throw new Error("DLQ_TEST_FAILURE");

      if (await hasProcessed(event.eventId)) {
        console.log(`Duplicate inventory event ignored: ${event.eventId}`);
        channel.ack(message);
        return;
      }

      const order = event.data;
      if (!order.orderId) throw invalidEvent("OrderCreated event missing orderId");
      if (!Array.isArray(order.items) || order.items.length === 0) {
        throw invalidEvent(`Order ${order.orderId} contains no items`);
      }

      const warehouseId = order.warehouseId || "WH01";
      const reservedItems = [];
      let failureReason = null;

      for (const item of order.items) {
        const productId = item.productId || item.product;
        const quantity = Number(item.quantity);

        if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
          throw invalidEvent(
            `Invalid item: productId=${productId}, quantity=${item.quantity}`
          );
        }

        const reserved = await reserveStock(productId, warehouseId, quantity);
        if (!reserved) {
          failureReason = `Insufficient inventory for ${productId}`;
          break;
        }

        reservedItems.push({ productId, quantity });
      }

      if (failureReason) {
        for (const item of reservedItems) {
          await releaseStock(item.productId, warehouseId, item.quantity);
        }

        publishEvent("InventoryReservationFailed", {
          orderId: order.orderId,
          customerId: order.customerId,
          items: order.items,
          warehouseId,
          reason: failureReason
        });
      } else {
        publishEvent("InventoryReserved", {
          orderId: order.orderId,
          customerId: order.customerId,
          totalAmount: Number(order.totalAmount),
          currency: order.currency || "GBP",
          items: order.items,
          warehouseId
        });
      }

      await markProcessed(event.eventId, event.eventType);
      console.log(`Inventory event processed: ${event.eventId}`);
      channel.ack(message);
    } catch (error) {
      console.error("Inventory order consumer error:", error.message);
      await retryOrDeadLetter(channel, message, orderQueue, error);
    }
  });

  await channel.consume(releaseQueue.queueName, async (message) => {
    if (!message) return;

    try {
      const event = parseEvent(message);

      if (await hasProcessed(event.eventId)) {
        console.log(`Duplicate inventory event ignored: ${event.eventId}`);
        channel.ack(message);
        return;
      }

      const { items, warehouseId, orderId } = event.data;
      if (!orderId || !Array.isArray(items) || items.length === 0) {
        throw invalidEvent("ReleaseInventory event contains no orderId or items");
      }

      for (const item of items) {
        const productId = item.productId || item.product;
        const quantity = Number(item.quantity);
        if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
          throw invalidEvent(`Invalid release item for order ${orderId}`);
        }

        const released = await releaseStock(productId, warehouseId || "WH01", quantity);
        if (!released) {
          throw new Error(`Reserved inventory cannot be released for ${productId}`);
        }
      }

      publishEvent("InventoryReleased", {
        orderId,
        warehouseId: warehouseId || "WH01"
      });

      await markProcessed(event.eventId, event.eventType);
      console.log(`Inventory release processed: ${event.eventId}`);
      channel.ack(message);
    } catch (error) {
      console.error("Inventory release consumer error:", error.message);
      await retryOrDeadLetter(channel, message, releaseQueue, error);
    }
  });

  console.log("Inventory consumers started");
}

module.exports = { startInventoryConsumer };
