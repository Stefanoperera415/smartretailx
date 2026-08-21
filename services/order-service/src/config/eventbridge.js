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
  try {
    // EventBridge doesn't require a persistent connection.
    // Creating the client is enough.
    console.log("========================================");
    console.log("Connected to Amazon EventBridge");
    console.log("Region:", process.env.AWS_REGION || "ap-south-1");
    console.log("Event bus:", EVENT_BUS_NAME);
    console.log("========================================");
  } catch (error) {
    console.error("EventBridge initialization failed:");
    console.error(error);
    process.exit(1);
  }
}

async function publishEvent(eventType, data) {
  const event = {
    eventId: `evt-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`,
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

  console.log(`Published EventBridge event: ${eventType}`);

  return event;
}

module.exports = {
  connectEventBridge,
  publishEvent,
  EVENT_BUS_NAME,
};