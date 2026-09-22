const { dynamoDB, INVENTORY_TABLE } = require("../config/database");
const {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

/**
 * Normalise an inventory item so every consumer sees the same shape.
 * Guarantees numeric fields and a computed `available`.
 */
function normalise(item) {
  if (!item) return null;
  const quantity = Number(item.quantity) || 0;
  const reservedQuantity = Number(item.reservedQuantity) || 0;
  const available =
    item.available !== undefined
      ? Number(item.available)
      : quantity - reservedQuantity;

  return {
    ...item,
    quantity,
    reservedQuantity,
    available,
    stockOnHand: quantity, // alias, easier to reason about in admin UI
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
 * Upsert inventory item.
 * Sets quantity and reorderLevel, preserves existing reservedQuantity,
 * and recomputes available = quantity - reservedQuantity.
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
 * Atomic reserve: decrement available, increment reservedQuantity.
 * NOTE: `quantity` (physical stock) is intentionally NOT changed here.
 *       Physical stock leaves the shelf only on ship, not on reserve.
 * Condition: available >= requested quantity.
 */
async function reserveStock(productId, warehouseId, quantity) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      UpdateExpression: `
        ADD #reserved :inc,
            #available :dec
      `,
      ConditionExpression: "#available >= :qty",
      ExpressionAttributeNames: {
        "#reserved": "reservedQuantity",
        "#available": "available",
      },
      ExpressionAttributeValues: {
        ":inc": quantity,
        ":dec": -quantity,
        ":qty": quantity,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return normalise(result.Attributes);
}

/**
 * Atomic release: increment available, decrement reservedQuantity.
 * Condition: reservedQuantity >= requested quantity.
 */
async function releaseStock(productId, warehouseId, quantity) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      UpdateExpression: `
        ADD #reserved :dec,
            #available :inc
      `,
      ConditionExpression: "#reserved >= :qty",
      ExpressionAttributeNames: {
        "#reserved": "reservedQuantity",
        "#available": "available",
      },
      ExpressionAttributeValues: {
        ":dec": -quantity,
        ":inc": quantity,
        ":qty": quantity,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return normalise(result.Attributes);
}

async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({
      TableName: INVENTORY_TABLE,
    })
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