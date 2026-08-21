const { dynamoDB, PROCESSED_EVENTS_TABLE } = require("../config/database");
const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

/**
 * Check if an event has already been processed.
 */
async function hasProcessed(eventId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: PROCESSED_EVENTS_TABLE,
      Key: { eventId },
    })
  );
  return !!result.Item; // true if item exists
}

/**
 * Mark an event as processed (idempotent – only inserts if not exists).
 */
async function markProcessed(eventId, eventType) {
  await dynamoDB.send(
    new PutCommand({
      TableName: PROCESSED_EVENTS_TABLE,
      Item: {
        eventId,
        eventType,
        processedAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(eventId)", // prevents duplicates
    })
  );
  return true;
}

module.exports = { hasProcessed, markProcessed };