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
    console.log("========================================");
    console.log("Connected to Amazon EventBridge");
    console.log("Region:", process.env.AWS_REGION || "ap-south-1");
    console.log("Event bus:", EVENT_BUS_NAME);
    console.log("Source: smartretailx.payment-service");
    console.log("========================================");
  } catch (error) {
    console.error("EventBridge initialization failed:", error);
    process.exit(1);
  }
}

async function publishEvent(eventType, data) {
  const event = {
    eventId: `evt-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`,

    eventType,

    source: "smartretailx.payment-service",

    timestamp: new Date().toISOString(),

    data,
  };

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: EVENT_BUS_NAME,

        Source: "smartretailx.payment-service",

        DetailType: eventType,

        Detail: JSON.stringify(event),
      },
    ],
  });

  try {
    const response = await eventBridge.send(command);

    if (response.FailedEntryCount > 0) {
      console.error(
        "EventBridge failed to publish event:",
        response.Entries
      );

      throw new Error(
        `Failed to publish EventBridge event: ${eventType}`
      );
    }

    console.log(
      `Published EventBridge event: ${eventType}`
    );

    return event;
  } catch (error) {
    console.error(
      `Failed to publish EventBridge event: ${eventType}`
    );

    console.error(error);

    throw error;
  }
}

module.exports = {
  connectEventBridge,
  publishEvent,
  EVENT_BUS_NAME,
};