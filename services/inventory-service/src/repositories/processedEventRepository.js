const {
  dynamoDB,
  PROCESSED_EVENTS_TABLE,
} = require("../config/database");
const { GetCommand, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

/**
 * Check if an event has already been processed.
 * (Kept for backwards compatibility; the consumer now uses the atomic claim.)
 */
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

/**
 * Attempt to claim an event for processing.
 * Returns TRUE if we won the claim (first delivery),
 * FALSE if it was already claimed by another consumer.
 *
 * Never throws on a duplicate — that's the whole point.
 */
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

/**
 * Remove the claim marker. Called when the handler fails so the event
 * can be retried via SQS redelivery without being treated as a duplicate.
 */
async function unmarkProcessed(eventId) {
  try {
    await dynamoDB.send(
      new DeleteCommand({
        TableName: PROCESSED_EVENTS_TABLE,
        Key: { eventId },
      })
    );
    return true;
  } catch (error) {
    console.error(`Failed to unmark event ${eventId}:`, error.message);
    return false;
  }
}

module.exports = { hasProcessed, markProcessed, unmarkProcessed };