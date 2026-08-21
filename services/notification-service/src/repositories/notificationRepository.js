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
    // Sort manually (DynamoDB Scan doesn't guarantee order)
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
  // Since we don't have a GSI on eventId, we scan (or we could add a GSI)
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

async function updateStatus(notificationId, status, additionalFields = {}) {
  const updateExpression = "SET #status = :status, updatedAt = :updatedAt";
  const expressionAttributeNames = { "#status": "status" };
  const expressionAttributeValues = {
    ":status": status,
    ":updatedAt": new Date().toISOString(),
  };
  // Add optional fields
  for (const [key, value] of Object.entries(additionalFields)) {
    const fieldKey = `#${key}`;
    const valueKey = `:${key}`;
    updateExpression.push(`${fieldKey} = ${valueKey}`);
    expressionAttributeNames[fieldKey] = key;
    expressionAttributeValues[valueKey] = value;
  }

  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: { notificationId },
      UpdateExpression: `SET ${Object.keys(additionalFields).map(k => `#${k} = :${k}`).join(", ")}, updatedAt = :updatedAt`,
      ExpressionAttributeNames: { "#status": "status", ...Object.fromEntries(Object.keys(additionalFields).map(k => [`#${k}`, k])) },
      ExpressionAttributeValues: {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
        ...Object.fromEntries(Object.entries(additionalFields).map(([k, v]) => [`:${k}`, v])),
      },
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