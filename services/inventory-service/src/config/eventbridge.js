require("dotenv").config();

const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

const eventBridge = new EventBridgeClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const EVENT_BUS_NAME = process.env.EVENTBRIDGE_BUS_NAME || "smartretailx-events";

async function connectEventBridge() {
  console.log("========================================");
  console.log("Inventory Service connected to EventBridge");
  console.log("Region:", process.env.AWS_REGION || "ap-south-1");
  console.log("Event bus:", EVENT_BUS_NAME);
  console.log("Source: smartretailx.inventory-service");
  console.log("========================================");
}

async function publishEvent(eventType, data) {
  const event = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    eventType,
    source: "smartretailx.inventory-service",
    timestamp: new Date().toISOString(),
    data,
  };

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: EVENT_BUS_NAME,
        Source: "smartretailx.inventory-service",
        DetailType: eventType,
        Detail: JSON.stringify(event),
      },
    ],
  });

  try {
    const response = await eventBridge.send(command);
    if (response.FailedEntryCount > 0) {
      console.error("EventBridge failed to publish event:", response.Entries);
      throw new Error(`Failed to publish EventBridge event: ${eventType}`);
    }
    console.log(`Published EventBridge event: ${eventType}`);
    return event;
  } catch (error) {
    console.error(`Failed to publish EventBridge event: ${eventType}`, error);
    throw error;
  }
}

module.exports = { connectEventBridge, publishEvent, EVENT_BUS_NAME };