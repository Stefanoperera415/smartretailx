require("dotenv").config();

const {
  publishEvent,
} = require("./src/config/eventBridge");

async function test() {
  try {
    const event = await publishEvent("OrderCreated", {
      orderId: "TEST-001",
      customerId: "CUSTOMER-001",
      items: [
        {
          productId: "P001",
          quantity: 1,
        },
      ],
    });

    console.log("Test event successfully published:");
    console.log(JSON.stringify(event, null, 2));
  } catch (error) {
    console.error("EventBridge test failed:");
    console.error(error);
    process.exit(1);
  }
}

test();