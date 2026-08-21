const { dynamoDB, PROCESSED_EVENTS_TABLE } = require("../config/database");
const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

async function hasProcessed(eventId) {
  try {
    const result = await dynamoDB.send(
      new GetCommand({
        TableName: PROCESSED_EVENTS_TABLE,
        Key: { eventId },
      })
    );
    return !!result.Item;
  } catch (error) {
    return false;
  }
}

async function markProcessed(eventId, eventType) {
  try {
    await dynamoDB.send(
      new PutCommand({
        TableName: PROCESSED_EVENTS_TABLE,
        Item: {
          eventId,
          eventType,
          processedAt: new Date().toISOString(),
        },
        ConditionExpression: "attribute_not_exists(eventId)",
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

module.exports = { hasProcessed, markProcessed };