require("dotenv").config();

const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { publishEvent } = require("../config/eventbridge");
const { reserveStock, releaseStock } = require("../service/inventoryService");
const { hasProcessed, markProcessed } = require("../service/idempotencyService");
const inventoryRepo = require("../repositories/inventoryRepository"); // <-- new import

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });

const INVENTORY_QUEUE_URL = process.env.INVENTORY_QUEUE_URL;
if (!INVENTORY_QUEUE_URL) {
  throw new Error("INVENTORY_QUEUE_URL is not defined");
}

// ==========================================
// Start SQS Consumer
// ==========================================
async function startInventoryConsumer() {
  console.log("========================================");
  console.log("Starting Inventory SQS consumer");
  console.log("Queue:", INVENTORY_QUEUE_URL);
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
        QueueUrl: INVENTORY_QUEUE_URL,
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
    console.log("Received Inventory SQS message");

    // 1) Parse the SQS body (EventBridge envelope)
    const rawEvent = JSON.parse(message.Body);
    console.log("Raw EventBridge event:", JSON.stringify(rawEvent, null, 2));

    // 2) Extract the event from the "detail" field
    const detail = rawEvent.detail;
    if (!detail) {
      throw new Error("EventBridge message missing 'detail' field");
    }

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
    } else if (eventType === "ReleaseInventory") {
      await handleReleaseInventory(data, eventId, eventType);
    } else if (eventType === "ProductCreated") {
      await handleProductCreated(data, eventId, eventType);
    } else {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      // Delete the message – we don't need to retry
      await deleteMessage(message);
      return;
    }

    // 4) Mark as processed (idempotency)
    await markProcessed(eventId, eventType);

    // 5) Delete the SQS message
    await deleteMessage(message);
    console.log("Inventory SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Inventory consumer error:", error);
    // Do NOT delete the message – SQS will retry after visibility timeout
    console.error("Message will remain in SQS and will be retried.");
  }
}

// ==========================================
// Handle OrderCreated
// ==========================================
async function handleOrderCreated(order, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate OrderCreated event ignored: ${eventId}`);
    return;
  }

  if (!order.orderId) throw new Error("OrderCreated missing orderId");
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error(`Order ${order.orderId} contains no items`);
  }

  // We no longer use order.warehouseId – we will pick per product
  const warehouseMapping = {}; // productId -> warehouseId chosen
  const reservedItems = [];
  let failureReason = null;

  for (const item of order.items) {
    const productId = item.productId || item.product;
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid item: productId=${productId}, quantity=${item.quantity}`);
    }

    // Find all warehouses for this product
    const inventoryItems = await inventoryRepo.findByProductId(productId);
    // Filter those with available >= quantity
    const suitable = inventoryItems.filter(inv => inv.available >= quantity);
    if (suitable.length === 0) {
      failureReason = `Insufficient inventory for ${productId} (no warehouse has enough)`;
      break;
    }

    // Pick the first suitable warehouse (you could improve by picking one with most stock)
    const chosenWarehouse = suitable[0].warehouseId;
    warehouseMapping[productId] = chosenWarehouse;

    // Reserve from that warehouse
    const reserved = await inventoryRepo.reserveStock(productId, chosenWarehouse, quantity);
    if (!reserved) {
      failureReason = `Failed to reserve ${productId} in warehouse ${chosenWarehouse}`;
      break;
    }
    reservedItems.push({ productId, quantity, warehouseId: chosenWarehouse });
  }

  if (failureReason) {
    // Rollback any reserved items
    for (const item of reservedItems) {
      await inventoryRepo.releaseStock(item.productId, item.warehouseId, item.quantity);
    }
    await publishEvent("InventoryReservationFailed", {
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      reason: failureReason,
      // no warehouseId – inventory decides
    });
    console.log(`InventoryReservationFailed published for ${order.orderId}`);
  } else {
    // Success – publish InventoryReserved with the chosen warehouses
    // The event can include a map of product->warehouse, but we keep it simple:
    await publishEvent("InventoryReserved", {
      orderId: order.orderId,
      customerId: order.customerId,
      totalAmount: Number(order.totalAmount),
      currency: order.currency || "GBP",
      items: order.items, // still original items
      warehouseMapping,   // optional: include the mapping for transparency
      warehouseId: Object.values(warehouseMapping)[0] || "WH01" // for backward compatibility
    });
    console.log(`InventoryReserved published for ${order.orderId}`);
  }
}

// ==========================================
// Handle ReleaseInventory
// ==========================================
async function handleReleaseInventory(data, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate ReleaseInventory event ignored: ${eventId}`);
    return;
  }

  const { orderId, items, warehouseId } = data;
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    throw new Error("ReleaseInventory event missing orderId or items");
  }

  const whId = warehouseId || "WH01";

  for (const item of items) {
    const productId = item.productId || item.product;
    const quantity = Number(item.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid release item for order ${orderId}`);
    }
    const released = await releaseStock(productId, whId, quantity);
    if (!released) {
      throw new Error(`Reserved inventory cannot be released for ${productId}`);
    }
  }

  await publishEvent("InventoryReleased", {
    orderId,
    warehouseId: whId,
  });
  console.log(`InventoryReleased published for ${orderId}`);
}

// ==========================================
// Handle ProductCreated
// ==========================================
async function handleProductCreated(data, eventId, eventType) {
  // Idempotency check
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate ProductCreated event ignored: ${eventId}`);
    return;
  }

  const { productId, initialStock = 0, warehouseId = "WH01" } = data;
  if (!productId) {
    throw new Error("ProductCreated event missing productId");
  }

  // Create inventory record with the given stock
  await inventoryRepo.upsert(productId, warehouseId, initialStock, 10);
  console.log(`Inventory created for product ${productId} in warehouse ${warehouseId} with stock ${initialStock}`);
}

// ==========================================
// Delete SQS Message
// ==========================================
async function deleteMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: INVENTORY_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  });
  await sqs.send(command);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startInventoryConsumer };