const { dynamoDB, INVENTORY_TABLE } = require("../config/database");
const {
  GetCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

function normalise(item) {
  if (!item) return null;
  const quantity = Number(item.quantity) || 0;
  const reservedQuantity = Number(item.reservedQuantity) || 0;

  // Prefer stored `available`, but fall back to derived value so legacy
  // items (created before `available` was introduced) still report correctly.
  const available =
    item.available !== undefined && item.available !== null
      ? Number(item.available)
      : quantity - reservedQuantity;

  return {
    ...item,
    quantity,
    reservedQuantity,
    available,
    stockOnHand: quantity,
  };
}

async function findByProductId(productId) {
  const result = await dynamoDB.send(
    new QueryCommand({
      TableName: INVENTORY_TABLE,
      KeyConditionExpression: "productId = :pid",
      ExpressionAttributeValues: { ":pid": productId },
    })
  );
  return (result.Items || []).map(normalise);
}

async function findOne(productId, warehouseId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
    })
  );
  return normalise(result.Item);
}

/**
 * Upsert inventory. Sets quantity + reorderLevel, preserves reservedQuantity,
 * recomputes available = quantity - reservedQuantity.
 */
async function upsert(productId, warehouseId, quantity, reorderLevel = 10) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      UpdateExpression: `
        SET #qty = :qty,
            #reorder = :reorder,
            #reserved = if_not_exists(#reserved, :zero),
            #available = :qty - if_not_exists(#reserved, :zero)
      `,
      ExpressionAttributeNames: {
        "#qty": "quantity",
        "#reorder": "reorderLevel",
        "#reserved": "reservedQuantity",
        "#available": "available",
      },
      ExpressionAttributeValues: {
        ":qty": quantity,
        ":reorder": reorderLevel,
        ":zero": 0,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return normalise(result.Attributes);
}

/**
 * Atomic reserve.
 *  - reservedQuantity += qty
 *  - available        -= qty
 *  - quantity stays untouched (physical stock leaves only on ship)
 *
 * ✅ FIX: uses `if_not_exists(#available, #quantity)` so legacy items that
 *         never got an `available` attribute still reserve correctly.
 *         If `available` is missing, we assume it equals `quantity`.
 */
async function reserveStock(productId, warehouseId, quantity) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      UpdateExpression: `
        SET #reserved = if_not_exists(#reserved, :zero) + :qty,
            #available = if_not_exists(#available, #quantity) - :qty
      `,
      ConditionExpression:
        "attribute_exists(productId) AND if_not_exists(#available, #quantity) >= :qty",
      ExpressionAttributeNames: {
        "#reserved": "reservedQuantity",
        "#available": "available",
        "#quantity": "quantity",
      },
      ExpressionAttributeValues: {
        ":qty": quantity,
        ":zero": 0,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return normalise(result.Attributes);
}

/**
 * Atomic release. Mirror of reserve. Idempotent on the caller side.
 */
async function releaseStock(productId, warehouseId, quantity) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      UpdateExpression: `
        SET #reserved = if_not_exists(#reserved, :zero) - :qty,
            #available = if_not_exists(#available, #quantity) + :qty
      `,
      ConditionExpression: "if_not_exists(#reserved, :zero) >= :qty",
      ExpressionAttributeNames: {
        "#reserved": "reservedQuantity",
        "#available": "available",
        "#quantity": "quantity",
      },
      ExpressionAttributeValues: {
        ":qty": quantity,
        ":zero": 0,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return normalise(result.Attributes);
}

async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({ TableName: INVENTORY_TABLE })
  );
  return (result.Items || []).map(normalise);
}

async function deleteInventory(productId, warehouseId) {
  const result = await dynamoDB.send(
    new DeleteCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      ReturnValues: "ALL_OLD",
    })
  );
  return !!result.Attributes;
}

module.exports = {
  findByProductId,
  findOne,
  findAll,
  upsert,
  reserveStock,
  releaseStock,
  deleteInventory,
};