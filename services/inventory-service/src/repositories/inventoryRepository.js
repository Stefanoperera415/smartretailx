const { dynamoDB, INVENTORY_TABLE } = require("../config/database");
const { GetCommand, PutCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

async function findByProductId(productId) {
  const result = await dynamoDB.send(
    new QueryCommand({
      TableName: INVENTORY_TABLE,
      KeyConditionExpression: "productId = :pid",
      ExpressionAttributeValues: { ":pid": productId },
    })
  );
  return result.Items || [];
}

async function findOne(productId, warehouseId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
    })
  );
  return result.Item || null;
}

/**
 * Upsert inventory item.
 * Sets quantity, reorderLevel, reservedQuantity (0), and available (quantity).
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
            #available = :qty
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
  return result.Attributes;
}

/**
 * Atomic reserve: decrement available, increment reservedQuantity.
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
  return result.Attributes;
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
  return result.Attributes;
}


async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({
      TableName: INVENTORY_TABLE,
    })
  );
  return result.Items || [];
}

async function deleteInventory(productId, warehouseId) {
  const result = await dynamoDB.send(
    new DeleteCommand({
      TableName: INVENTORY_TABLE,
      Key: { productId, warehouseId },
      ReturnValues: "ALL_OLD",
    })
  );
  return !!result.Attributes; // true if something was deleted
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