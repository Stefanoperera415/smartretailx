const { dynamoDB, NOTIFICATIONS_TABLE } = require("../config/database");
const { GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");

async function findAll(filters = {}) {
  let result;
  if (filters.customerId) {
    result = await dynamoDB.send(
      new QueryCommand({
        TableName: NOTIFICATIONS_TABLE,
        IndexName: "customerId-index",
        KeyConditionExpression: "customerId = :cid",
        ExpressionAttributeValues: { ":cid": filters.customerId },
        ScanIndexForward: false,
      })
    );
  } else if (filters.status) {
    result = await dynamoDB.send(
      new QueryCommand({
        TableName: NOTIFICATIONS_TABLE,
        IndexName: "status-index",
        KeyConditionExpression: "#status = :s",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":s": filters.status },
        ScanIndexForward: false,
      })
    );
  } else {
    result = await dynamoDB.send(new ScanCommand({ TableName: NOTIFICATIONS_TABLE }));
    result.Items = (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return result.Items || [];
}

async function findById(notificationId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: { notificationId },
    })
  );
  return result.Item || null;
}

async function findOneByEventId(eventId) {
  const result = await dynamoDB.send(
    new ScanCommand({
      TableName: NOTIFICATIONS_TABLE,
      FilterExpression: "eventId = :eid",
      ExpressionAttributeValues: { ":eid": eventId },
    })
  );
  return result.Items ? result.Items[0] : null;
}

async function create(notification) {
  const now = new Date().toISOString();
  const item = {
    ...notification,
    createdAt: notification.createdAt || now,
    updatedAt: notification.updatedAt || now,
  };
  await dynamoDB.send(
    new PutCommand({
      TableName: NOTIFICATIONS_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(notificationId)",
    })
  );
  return item;
}

/**
 * Update notification status and optional additional fields (e.g., readAt, sentAt).
 * ✅ FIXED: Properly builds UpdateExpression dynamically.
 */
async function updateStatus(notificationId, status, additionalFields = {}) {
  // Start with mandatory fields: status and updatedAt
  const updateParts = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Add status
  updateParts.push("#status = :status");
  expressionAttributeNames["#status"] = "status";
  expressionAttributeValues[":status"] = status;

  // Add updatedAt
  updateParts.push("updatedAt = :updatedAt");
  expressionAttributeValues[":updatedAt"] = new Date().toISOString();

  // Add additional fields
  for (const [key, value] of Object.entries(additionalFields)) {
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    updateParts.push(`${nameKey} = ${valueKey}`);
    expressionAttributeNames[nameKey] = key;
    expressionAttributeValues[valueKey] = value;
  }

  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: { notificationId },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes;
}

module.exports = {
  findAll,
  findById,
  findOneByEventId,
  create,
  updateStatus,
};