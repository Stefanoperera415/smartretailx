require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const { publishEvent } = require("../config/eventbridge");
const { releaseStock } = require("../service/inventoryService");
const {
  markProcessed,
  unmarkProcessed,
} = require("../service/idempotencyService");
const inventoryRepo = require("../repositories/inventoryRepository");
const warehouseRepo = require("../repositories/warehouseRepository");

const sqs = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
const INVENTORY_QUEUE_URL = process.env.INVENTORY_QUEUE_URL;
if (!INVENTORY_QUEUE_URL) throw new Error("INVENTORY_QUEUE_URL is not defined");

const SUPPORTED_EVENT_TYPES = [
  "OrderCreated",
  "ReleaseInventory",
  "ProductCreated",
];

async function startInventoryConsumer() {
  console.log("========================================");
  console.log("Starting Inventory SQS consumer");
  console.log("Queue:", INVENTORY_QUEUE_URL);
  console.log("========================================");
  pollMessages();
}

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

async function processMessage(message) {
  let claimedEventId = null;

  try {
    console.log("----------------------------------------");
    console.log("Received Inventory SQS message");

    const rawEvent = JSON.parse(message.Body);
    const detail = rawEvent.detail;
    if (!detail) throw new Error("EventBridge message missing 'detail' field");

    const eventType = detail.eventType || rawEvent["detail-type"];
    const eventId = detail.eventId;
    const data = detail.data;

    if (!eventId) throw new Error("Event missing eventId");
    if (!eventType) throw new Error("Event missing eventType");
    if (!data || typeof data !== "object") throw new Error("Event missing data");

    console.log("Event type:", eventType, "id:", eventId);

    // Unsupported types are acked (deleted) WITHOUT a claim.
    if (!SUPPORTED_EVENT_TYPES.includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`);
      await deleteMessage(message);
      return;
    }

    // ✅ CLAIM FIRST — atomic conditional write closes the race between
    //    concurrent SQS deliveries of the same message.
    const claimed = await markProcessed(eventId, eventType);
    if (!claimed) {
      console.log(`Duplicate event ignored: ${eventId}`);
      await deleteMessage(message);
      return;
    }
    claimedEventId = eventId;

    // Dispatch — handlers no longer check hasProcessed (we own the claim).
    if (eventType === "OrderCreated") {
      await handleOrderCreated(data);
    } else if (eventType === "ReleaseInventory") {
      await handleReleaseInventory(data);
    } else if (eventType === "ProductCreated") {
      await handleProductCreated(data);
    }

    await deleteMessage(message);
    console.log("Inventory SQS message deleted successfully");
    console.log("----------------------------------------");
  } catch (error) {
    console.error("Inventory consumer error:", error);

    // ✅ Roll back the claim so SQS redelivery retries the handler.
    if (claimedEventId) {
      await unmarkProcessed(claimedEventId);
      console.warn(
        `Claim rolled back for ${claimedEventId} — message will retry`
      );
    }

    console.log("Message will remain in SQS and will be retried.");
  }
}

// ---------------------------------------------------------------------------
// Handlers — no internal idempotency checks; the outer claim owns that.
// ---------------------------------------------------------------------------

async function handleOrderCreated(order) {
  if (!order.orderId) throw new Error("OrderCreated missing orderId");
  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new Error(`Order ${order.orderId} contains no items`);
  }

  const requestedWarehouseId = order.warehouseId || null;

  if (requestedWarehouseId) {
    const wh = await warehouseRepo.findById(requestedWarehouseId);
    if (!wh) throw new Error(`Warehouse ${requestedWarehouseId} does not exist`);
  }

  const warehouseMapping = {};
  const reservedItems = [];
  let failureReason = null;

  for (const item of order.items) {
    const productId = item.productId || item.product;
    const quantity = Number(item.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(
        `Invalid item: productId=${productId}, quantity=${item.quantity}`
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
        (inv) => inv.warehouseId === requestedWarehouseId
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
        quantity
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
    // Rollback — if this fails, escalate so the whole message retries.
    const rollbackErrors = [];
    for (const item of reservedItems) {
      try {
        await inventoryRepo.releaseStock(
          item.productId,
          item.warehouseId,
          item.quantity
        );
      } catch (releaseError) {
        console.error(
          `Rollback failed for ${item.productId}:`,
          releaseError.message
        );
        rollbackErrors.push(releaseError.message);
      }
    }

    if (rollbackErrors.length > 0) {
      // Escalate: leave the SQS message for redelivery.
      throw new Error(
        `Rollback failed for ${rollbackErrors.length} item(s): ${rollbackErrors.join("; ")}`
      );
    }

    await publishEvent(
      "InventoryReservationFailed",
      {
        orderId: order.orderId,
        customerId: order.customerId,
        items: order.items,
        reason: failureReason,
      },
      { eventId: `inv-fail-${order.orderId}` }
    );
    console.log(`InventoryReservationFailed published for ${order.orderId}`);
  } else {
    const itemsWithWh = order.items.map((it) => ({
      ...it,
      warehouseId: warehouseMapping[it.productId] || null,
    }));

    await publishEvent(
      "InventoryReserved",
      {
        orderId: order.orderId,
        customerId: order.customerId,
        totalAmount: Number(order.totalAmount),
        currency: order.currency || "GBP",
        items: itemsWithWh,
        warehouseMapping,
        warehouseId: Object.values(warehouseMapping)[0] || null,
      },
      { eventId: `inv-reserved-${order.orderId}` }
    );
    console.log(`InventoryReserved published for ${order.orderId}`);
  }
}

/**
 * Release reserved stock. Each item carries its own warehouseId so
 * multi-warehouse orders compensate correctly.
 * "Already released" is treated as a successful no-op (idempotent).
 */
async function handleReleaseInventory(data) {
  const { orderId, items, warehouseId: fallbackWh } = data;
  if (!orderId || !Array.isArray(items) || items.length === 0) {
    throw new Error("ReleaseInventory event missing orderId or items");
  }

  const fallbackWhId = fallbackWh || "WH01";

  for (const item of items) {
    const productId = item.productId || item.product;
    const quantity = Number(item.quantity);
    const whId = item.warehouseId || fallbackWhId;

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Invalid release item for order ${orderId}`);
    }

    const wh = await warehouseRepo.findById(whId);
    if (!wh) throw new Error(`Warehouse ${whId} does not exist`);

    try {
      await releaseStock(productId, whId, quantity);
    } catch (err) {
      // Treat "nothing to release" as a successful no-op (idempotent).
      if (
        err.name === "ConditionalCheckFailedException" ||
        /ConditionalCheckFailed/i.test(err.message || "")
      ) {
        console.warn(
          `releaseStock no-op for ${productId}/${whId} — already released`
        );
        continue;
      }
      throw err;
    }
  }

  await publishEvent(
    "InventoryReleased",
    { orderId, warehouseId: fallbackWhId },
    { eventId: `inv-released-${orderId}` }
  );
  console.log(`InventoryReleased published for ${orderId}`);
}

async function handleProductCreated(data) {
  const { productId, initialStock = 0, warehouseId } = data;
  if (!productId) throw new Error("ProductCreated event missing productId");

  let resolvedWarehouseId = warehouseId;

  if (!resolvedWarehouseId) {
    const all = await warehouseRepo.findAll();
    const active = all.filter((w) => w.status === "ACTIVE");
    if (active.length > 0) {
      resolvedWarehouseId = active[0].warehouseId;
      console.log(
        `No warehouse provided; using first active warehouse: ${resolvedWarehouseId}`
      );
    } else {
      const defaultId = "WH01";
      console.log(
        `No active warehouses found; creating default warehouse ${defaultId}`
      );
      await warehouseRepo.create({
        warehouseId: defaultId,
        name: "Default Warehouse",
        location: "Auto-created",
        status: "ACTIVE",
      });
      resolvedWarehouseId = defaultId;
    }
  } else {
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
          throw new Error(
            `Failed to create warehouse ${resolvedWarehouseId}: ${createError.message}`
          );
        }
      }
    }
  }

  await inventoryRepo.upsert(productId, resolvedWarehouseId, initialStock, 10);
  console.log(
    `Inventory created for ${productId} in ${resolvedWarehouseId} with stock ${initialStock}`
  );
}

async function deleteMessage(message) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: INVENTORY_QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    })
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { startInventoryConsumer };