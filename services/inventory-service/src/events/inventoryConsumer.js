require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { publishEvent } = require("../config/eventbridge");
const { reserveStock, releaseStock } = require("../service/inventoryService");
const {
  hasProcessed,
  markProcessed,
} = require("../service/idempotencyService");
const inventoryRepo = require("../repositories/inventoryRepository");
const warehouseRepo = require("../repositories/warehouseRepository");

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

    const rawEvent = JSON.parse(message.Body);
    console.log("Raw EventBridge event:", JSON.stringify(rawEvent, null, 2));

    const detail = rawEvent.detail;
    if (!detail) {
      throw new Error("EventBridge message missing 'detail' field");
    }

    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object")
      throw new Error("Event missing data");

    console.log("Event type:", eventType);

    if (eventType === "OrderCreated") {
      await handleOrderCreated(data, eventId, eventType);
    } else if (eventType === "ReleaseInventory") {
      await handleReleaseInventory(data, eventId, eventType);
    } else if (eventType === "ProductCreated") {
      await handleProductCreated(data, eventId, eventType);
    } else {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    await markProcessed(eventId, eventType);
    await deleteMessage(message);
    console.log("Inventory SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Inventory consumer error:", error);
    console.error("Message will remain in SQS and will be retried.");
  }
}

// ==========================================
// Handle OrderCreated (unchanged)
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

  const requestedWarehouseId = order.warehouseId || null;

  if (requestedWarehouseId) {
    const wh = await warehouseRepo.findById(requestedWarehouseId);
    if (!wh) {
      throw new Error(`Warehouse ${requestedWarehouseId} does not exist`);
    }
  }

  const warehouseMapping = {};
  const reservedItems = [];
  let failureReason = null;

  for (const item of order.items) {
    const productId = item.productId || item.product;
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(
        `Invalid item: productId=${productId}, quantity=${item.quantity}`,
      );
    }

    const inventoryItems = await inventoryRepo.findByProductId(productId);
    let suitable = inventoryItems.filter((inv) => inv.available >= quantity);

    if (suitable.length === 0) {
      failureReason = `Insufficient inventory for ${productId} (no warehouse has enough)`;
      break;
    }

    if (requestedWarehouseId) {
      const specific = suitable.filter(
        (inv) => inv.warehouseId === requestedWarehouseId,
      );
      if (specific.length === 0) {
        failureReason = `Requested warehouse ${requestedWarehouseId} does not have enough stock for ${productId}`;
        break;
      }
      suitable = specific;
    }

    suitable.sort((a, b) => b.available - a.available);
    const chosen = suitable[0];
    warehouseMapping[productId] = chosen.warehouseId;

    try {
      const reserved = await inventoryRepo.reserveStock(
        productId,
        chosen.warehouseId,
        quantity,
      );
      if (!reserved) {
        failureReason = `Failed to reserve ${productId} in warehouse ${chosen.warehouseId}`;
        break;
      }
      reservedItems.push({
        productId,
        quantity,
        warehouseId: chosen.warehouseId,
      });
    } catch (error) {
      failureReason = `Error reserving ${productId}: ${error.message}`;
      break;
    }
  }

  if (failureReason) {
    for (const item of reservedItems) {
      try {
        await inventoryRepo.releaseStock(
          item.productId,
          item.warehouseId,
          item.quantity,
        );
      } catch (releaseError) {
        console.error(`Rollback failed for ${item.productId}:`, releaseError);
      }
    }
    await publishEvent("InventoryReservationFailed", {
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items,
      reason: failureReason,
    });
    console.log(`InventoryReservationFailed published for ${order.orderId}`);
  } else {
    await publishEvent("InventoryReserved", {
      orderId: order.orderId,
      customerId: order.customerId,
      totalAmount: Number(order.totalAmount),
      currency: order.currency || "GBP",
      items: order.items,
      warehouseMapping: warehouseMapping,
      warehouseId: Object.values(warehouseMapping)[0] || null,
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
  const wh = await warehouseRepo.findById(whId);
  if (!wh) {
    throw new Error(`Warehouse ${whId} does not exist`);
  }

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
// Handle ProductCreated – smart warehouse fallback
// ==========================================
async function handleProductCreated(data, eventId, eventType) {
  if (await hasProcessed(eventId)) {
    console.log(`Duplicate ProductCreated event ignored: ${eventId}`);
    return;
  }

  const { productId, initialStock = 0, warehouseId } = data;
  if (!productId) {
    throw new Error("ProductCreated event missing productId");
  }

  let resolvedWarehouseId = warehouseId;

  // If warehouseId is not provided or empty, pick the first active warehouse
  if (!resolvedWarehouseId) {
    const all = await warehouseRepo.findAll();
    const active = all.filter(w => w.status === "ACTIVE");
    if (active.length > 0) {
      resolvedWarehouseId = active[0].warehouseId;
      console.log(`No warehouse provided; using first active warehouse: ${resolvedWarehouseId}`);
    } else {
      // No active warehouse – create a default one
      const defaultId = "WH01";
      console.log(`No active warehouses found; creating default warehouse ${defaultId}`);
      await warehouseRepo.create({
        warehouseId: defaultId,
        name: "Default Warehouse",
        location: "Auto-created",
        status: "ACTIVE",
      });
      resolvedWarehouseId = defaultId;
    }
  } else {
    // Validate that the warehouse exists; if not, create it
    let wh = await warehouseRepo.findById(resolvedWarehouseId);
    if (!wh) {
      console.log(`Warehouse ${resolvedWarehouseId} does not exist. Creating it now.`);
      try {
        await warehouseRepo.create({
          warehouseId: resolvedWarehouseId,
          name: `Warehouse ${resolvedWarehouseId}`,
          location: "Auto-created",
          status: "ACTIVE",
        });
      } catch (createError) {
        wh = await warehouseRepo.findById(resolvedWarehouseId);
        if (!wh) {
          throw new Error(`Failed to create warehouse ${resolvedWarehouseId}: ${createError.message}`);
        }
      }
    }
  }

  // Create inventory record
  await inventoryRepo.upsert(productId, resolvedWarehouseId, initialStock, 10);
  console.log(
    `Inventory created for product ${productId} in warehouse ${resolvedWarehouseId} with stock ${initialStock}`,
  );
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