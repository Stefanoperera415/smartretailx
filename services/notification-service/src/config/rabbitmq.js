const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = "smartretailx.events";

let connection;
let channel;

async function connectRabbitMQ() {
  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, "topic", {
    durable: true,
  });

  console.log("✅ Notification RabbitMQ connected");
}

function getChannel() {
  if (!channel) {
    throw new Error("RabbitMQ channel is not initialized");
  }
  return channel;
}

function publishEvent(eventType, data) {
  const event = {
    eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    eventType,
    source: "notification-service",
    timestamp: new Date().toISOString(),
    data,
  };

  getChannel().publish(
    EXCHANGE_NAME,
    eventType.toLowerCase(),
    Buffer.from(JSON.stringify(event)),
    {
      persistent: true,
      contentType: "application/json",
    }
  );

  console.log(`📤 Published event: ${eventType}`);
  return event;
}

module.exports = {
  connectRabbitMQ,
  getChannel,
  publishEvent,
  EXCHANGE_NAME,
};