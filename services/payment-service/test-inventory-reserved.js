require("dotenv").config();
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

const client = new EventBridgeClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

async function publishInventoryReserved() {
  const order = {
    orderId: `ORD-${Date.now()}`,
    customerId: "CUST-001",
    totalAmount: 5000,          // < 10000 → success; ≥ 10000 → failure
    currency: "GBP",
    items: [{ productId: "P001", quantity: 2 }],
    warehouseId: "WH01"
  };

  const event = {
    eventId: `evt-${Date.now()}`,
    eventType: "InventoryReserved",
    source: "smartretailx.inventory-service",
    timestamp: new Date().toISOString(),
    data: order
  };

  const command = new PutEventsCommand({
    Entries: [{
      EventBusName: process.env.EVENTBRIDGE_BUS_NAME || "smartretailx-events",
      Source: "smartretailx.inventory-service",
      DetailType: "InventoryReserved",
      Detail: JSON.stringify(event)
    }]
  });

  const response = await client.send(command);
  console.log("InventoryReserved published. Response:", JSON.stringify(response, null, 2));
}

publishInventoryReserved().catch(console.error);