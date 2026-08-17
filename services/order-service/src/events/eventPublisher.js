const {
  getChannel,
  EXCHANGE_NAME
} = require("../config/rabbitmq");

function publishEvent(
  eventType,
  data
) {
  const channel = getChannel();

  const event = {
    eventId: `evt-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)}`,

    eventType,

    source: "order-service",

    timestamp: new Date().toISOString(),

    data
  };

  const routingKey =
    eventType.toLowerCase();

  channel.publish(
    EXCHANGE_NAME,
    routingKey,
    Buffer.from(
      JSON.stringify(event)
    ),
    {
      persistent: true,
      contentType:
        "application/json"
    }
  );

  console.log(
    `Published event: ${eventType}`
  );

  return event;
}

module.exports = {
  publishEvent
};