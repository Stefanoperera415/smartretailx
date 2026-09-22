require("dotenv").config();

const {
  EventBridgeClient,
  PutEventsCommand,
} = require("@aws-sdk/client-eventbridge");

const eventBridge = new EventBridgeClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const EVENT_BUS_NAME =
  process.env.EVENTBRIDGE_BUS_NAME || "smartretailx-events";

async function connectEventBridge() {
  console.log("========================================");
  console.log("Connected to Amazon EventBridge");
  console.log("Region:", process.env.AWS_REGION || "ap-south-1");
  console.log("Event bus:", EVENT_BUS_NAME);
  console.log("Source: smartretailx.order-service");
  console.log("========================================");
}

/**
 * Publish an event.
 * @param {string} eventType
 * @param {object} data
 * @param {{ eventId?: string }} [options] — pass eventId to make the event
 *   deterministic (required for compensations so retries are idempotent).
 */
async function publishEvent(eventType, data, options = {}) {
  const eventId =
    options.eventId ||
    `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  const event = {
    eventId,
    eventType,
    source: "smartretailx.order-service",
    timestamp: new Date().toISOString(),
    data,
  };

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: EVENT_BUS_NAME,
        Source: "smartretailx.order-service",
        DetailType: eventType,
        Detail: JSON.stringify(event),
      },
    ],
  });

  const response = await eventBridge.send(command);

  if (response.FailedEntryCount > 0) {
    console.error("Failed to publish EventBridge event:", response.Entries);
    throw new Error("EventBridge event publishing failed");
  }

  console.log(`Published EventBridge event: ${eventType} (${eventId})`);
  return event;
}

module.exports = { connectEventBridge, publishEvent, EVENT_BUS_NAME };
