require("dotenv").config();

const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");

const orderRepository = require("../repositories/orderRepository");

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const ORDER_QUEUE_URL = process.env.ORDER_QUEUE_URL;

if (!ORDER_QUEUE_URL) {
  throw new Error("ORDER_QUEUE_URL is not defined");
}

// ==========================================
// Start Order SQS Consumer
// ==========================================

async function startOrderConsumer() {
  console.log("========================================");
  console.log("Starting Order SQS consumer");
  console.log("Queue:", ORDER_QUEUE_URL);
  console.log("========================================");

  pollMessages();
}

// ==========================================
// Poll SQS
// ==========================================

async function pollMessages() {
  while (true) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: ORDER_QUEUE_URL,

        MaxNumberOfMessages: 10,

        WaitTimeSeconds: 20,

        VisibilityTimeout: 30,

        MessageAttributeNames: ["All"],
      });

      const response = await sqs.send(command);

      const messages = response.Messages || [];

      if (messages.length === 0) {
        continue;
      }

      for (const message of messages) {
        await processMessage(message);
      }
    } catch (error) {
      console.error("SQS polling error:", error);

      await sleep(5000);
    }
  }
}

// ==========================================
// Process Message
// ==========================================

async function processMessage(message) {
  try {
    console.log("----------------------------------------");
    console.log("Received SQS message");

    // EventBridge -> SQS sends the EventBridge event
    // as the SQS message body.
    const event = JSON.parse(message.Body);

    console.log(
      "Raw EventBridge event:",
      JSON.stringify(event, null, 2)
    );

    // EventBridge envelope
    const eventType =
      event["detail-type"] ||
      event.detailType ||
      event.eventType;

    // IMPORTANT:
    // EventBridge places your original event inside "detail".
    //
    // Your original event looks like:
    //
    // detail: {
    //   eventId,
    //   eventType,
    //   source,
    //   timestamp,
    //   data: {
    //      orderId,
    //      ...
    //   }
    // }
    //
    // Therefore we need detail.data.
    const data =
      event.detail?.data ||
      event.data ||
      {};

    console.log("Event type:", eventType);
    console.log(
      "Event data:",
      JSON.stringify(data, null, 2)
    );

    // ==========================================
    // INVENTORY RESERVATION FAILED
    // ==========================================

    if (
      eventType === "InventoryReservationFailed"
    ) {
      await handleInventoryReservationFailed(data);

    // ==========================================
    // PAYMENT COMPLETED
    // ==========================================

    } else if (
      eventType === "PaymentCompleted"
    ) {
      await handlePaymentCompleted(data);

    // ==========================================
    // PAYMENT FAILED
    // ==========================================

    } else if (
      eventType === "PaymentFailed"
    ) {
      await handlePaymentFailed(data);

    } else {
      console.log(
        `Ignoring unsupported event type: ${eventType}`
      );
    }

    // ==========================================
    // Delete message after successful processing
    // ==========================================

    await deleteMessage(message);

    console.log(
      "SQS message deleted successfully"
    );

    console.log("----------------------------------------");
  } catch (error) {
    console.error(
      "Order SQS message processing failed:",
      error
    );

    /*
     * IMPORTANT:
     *
     * We DO NOT delete the message when processing
     * fails.
     *
     * SQS will make it visible again after the
     * visibility timeout.
     *
     * After maxReceiveCount, SQS moves it to
     * the configured DLQ.
     */

    console.error(
      "Message will remain in SQS and may be retried."
    );
  }
}

// ==========================================
// Inventory Reservation Failed
// ==========================================

async function handleInventoryReservationFailed(data) {
  const {
    orderId,
    reason,
  } = data;

  if (!orderId) {
    throw new Error(
      "InventoryReservationFailed missing orderId"
    );
  }

  console.log(
    `Processing InventoryReservationFailed for ${orderId}`
  );

  await orderRepository.updateStatus(
    orderId,
    "CANCELLED"
  );

  console.log(
    `Order ${orderId} cancelled because inventory failed: ${
      reason || "Unknown reason"
    }`
  );
}

// ==========================================
// Payment Completed
// ==========================================

async function handlePaymentCompleted(data) {
  const {
    orderId,
  } = data;

  if (!orderId) {
    throw new Error(
      "PaymentCompleted missing orderId"
    );
  }

  console.log(
    `Processing PaymentCompleted for ${orderId}`
  );

  await orderRepository.updateStatus(
    orderId,
    "CONFIRMED"
  );

  console.log(
    `Order ${orderId} confirmed`
  );
}

// ==========================================
// Payment Failed
// ==========================================

async function handlePaymentFailed(data) {
  const {
    orderId,
    customerId,
    items,
    warehouseId,
  } = data;

  if (!orderId) {
    throw new Error(
      "PaymentFailed missing orderId"
    );
  }

  console.log(
    `Processing PaymentFailed for ${orderId}`
  );

  // ------------------------------------------
  // 1. Update order status
  // ------------------------------------------

  await orderRepository.updateStatus(
    orderId,
    "PAYMENT_FAILED"
  );

  console.log(
    `Order ${orderId} marked as PAYMENT_FAILED`
  );

  // ------------------------------------------
  // 2. Publish compensation event
  // ------------------------------------------

  const {
    publishEvent,
  } = require("../config/eventbridge");

  await publishEvent(
    "ReleaseInventory",
    {
      orderId,

      customerId,

      items:
        Array.isArray(items)
          ? items
          : [],

      warehouseId:
        warehouseId || "WH01",
    }
  );

  console.log(
    `ReleaseInventory published for ${orderId}`
  );
}

// ==========================================
// Delete SQS Message
// ==========================================

async function deleteMessage(message) {
  const command = new DeleteMessageCommand({
    QueueUrl: ORDER_QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle,
  });

  await sqs.send(command);
}

// ==========================================
// Sleep
// ==========================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  startOrderConsumer,
};