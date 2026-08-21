require("dotenv").config();

const {
  EventBridgeClient,
  PutEventsCommand,
} = require("@aws-sdk/client-eventbridge");

const client = new EventBridgeClient({
  region: process.env.AWS_REGION || "ap-south-1",
});


async function test() {
  const event = {
    eventId: `evt-${Date.now()}`,
    eventType: "PaymentCompleted",
    source: "smartretailx.payment-service",
    timestamp: new Date().toISOString(),
    data: {
      orderId: "TEST-001",
    },
  };

  const command = new PutEventsCommand({
    Entries: [
      {
        EventBusName: "smartretailx-events",
        Source: "smartretailx.payment-service",
        DetailType: "PaymentCompleted",
        Detail: JSON.stringify(event),
      },
    ],
  });

  const response = await client.send(command);

  console.log("EventBridge response:");
  console.log(JSON.stringify(response, null, 2));

  console.log("PaymentCompleted test event published");
}

test().catch(console.error);