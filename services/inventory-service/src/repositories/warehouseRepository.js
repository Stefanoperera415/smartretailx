const { dynamoDB } = require("../config/database");
const { GetCommand, PutCommand, UpdateCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const WAREHOUSE_TABLE = process.env.DYNAMODB_WAREHOUSE_TABLE;
if (!WAREHOUSE_TABLE) throw new Error("DYNAMODB_WAREHOUSE_TABLE is not defined");

async function findById(warehouseId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: WAREHOUSE_TABLE,
      Key: { warehouseId },
    })
  );
  return result.Item || null;
}

async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({ TableName: WAREHOUSE_TABLE })
  );
  return result.Items || [];
}

async function create(warehouse) {
  const now = new Date().toISOString();
  const item = {
    ...warehouse,
    createdAt: now,
    updatedAt: now,
  };
  await dynamoDB.send(
    new PutCommand({
      TableName: WAREHOUSE_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(warehouseId)",
    })
  );
  return item;
}

async function update(warehouseId, updates) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  let index = 0;
  for (const [field, value] of Object.entries(updates)) {
    const nameKey = `#field${index}`;
    const valueKey = `:value${index}`;
    updateExpressions.push(`${nameKey} = ${valueKey}`);
    expressionAttributeNames[nameKey] = field;
    expressionAttributeValues[valueKey] = value;
    index++;
  }
  if (updateExpressions.length === 0) return findById(warehouseId);

  updateExpressions.push("updatedAt = :updatedAt");
  expressionAttributeValues[":updatedAt"] = new Date().toISOString();

  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: WAREHOUSE_TABLE,
      Key: { warehouseId },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
      ConditionExpression: "attribute_exists(warehouseId)",
    })
  );
  return result.Attributes;
}


async function remove(warehouseId) {
  try {
    await dynamoDB.send(
      new DeleteCommand({
        TableName: WAREHOUSE_TABLE,
        Key: { warehouseId },
        ConditionExpression: "attribute_exists(warehouseId)",
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

module.exports = { findById, findAll, create, update, remove };