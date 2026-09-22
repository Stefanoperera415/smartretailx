const { dynamoDB } = require("../config/database");
const { GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const CATEGORY_TABLE = process.env.DYNAMODB_CATEGORY_TABLE;
if (!CATEGORY_TABLE) throw new Error("DYNAMODB_CATEGORY_TABLE is not defined");

async function findById(categoryId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: CATEGORY_TABLE,
      Key: { categoryId },
    })
  );
  return result.Item || null;
}

async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({ TableName: CATEGORY_TABLE })
  );
  return result.Items || [];
}

async function create(category) {
  const now = new Date().toISOString();
  const item = { ...category, createdAt: now, updatedAt: now };
  await dynamoDB.send(
    new PutCommand({
      TableName: CATEGORY_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(categoryId)",
    })
  );
  return item;
}

async function update(categoryId, updates) {
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
  if (updateExpressions.length === 0) return findById(categoryId);

  updateExpressions.push("updatedAt = :updatedAt");
  expressionAttributeValues[":updatedAt"] = new Date().toISOString();

  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: CATEGORY_TABLE,
      Key: { categoryId },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
      ConditionExpression: "attribute_exists(categoryId)",
    })
  );
  return result.Attributes;
}

// ✅ NEW: Delete category
async function remove(categoryId) {
  try {
    await dynamoDB.send(
      new DeleteCommand({
        TableName: CATEGORY_TABLE,
        Key: { categoryId },
        ConditionExpression: "attribute_exists(categoryId)",
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

module.exports = { findById, findAll, create, update, remove };