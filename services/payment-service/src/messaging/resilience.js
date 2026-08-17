const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getMaxAttempts() {
  return positiveInteger(process.env.RABBITMQ_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
}

function getRetryDelayMs() {
  return positiveInteger(process.env.RABBITMQ_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);
}

function getRetryCount(message) {
  const count = Number((message.properties.headers || {})["x-retry-count"] || 0);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function nonRetryableError(message) {
  const error = new Error(message);
  error.nonRetryable = true;
  return error;
}

function parseEvent(message) {
  let event;
  try {
    event = JSON.parse(message.content.toString());
  } catch (error) {
    throw nonRetryableError("Message body is not valid JSON");
  }

  if (!event || typeof event !== "object") throw nonRetryableError("Message body must be a JSON object");
  if (!event.eventId || typeof event.eventId !== "string") throw nonRetryableError("Event is missing a valid eventId");
  if (!event.eventType || typeof event.eventType !== "string") throw nonRetryableError("Event is missing a valid eventType");
  if (!event.data || typeof event.data !== "object") throw nonRetryableError("Event is missing data");
  return event;
}

async function declareResilientQueue(channel, queueName, exchangeName, routingKeys) {
  const retryQueue = `${queueName}.retry`;
  const dlqQueue = `${queueName}.dlq`;
  const queue = await channel.assertQueue(queueName, { durable: true });

  await channel.assertQueue(retryQueue, {
    durable: true,
    arguments: {
      "x-message-ttl": getRetryDelayMs(),
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queueName
    }
  });
  await channel.assertQueue(dlqQueue, { durable: true });
  for (const routingKey of routingKeys) {
    await channel.bindQueue(queue.queue, exchangeName, routingKey);
  }
  return { queueName, retryQueue, dlqQueue };
}

async function retryOrDeadLetter(channel, message, queueConfig, error) {
  const retryCount = getRetryCount(message);
  const attempt = retryCount + 1;
  const headers = {
    ...(message.properties.headers || {}),
    "x-original-queue": queueConfig.queueName,
    "x-last-error": String(error.message || error).slice(0, 1000),
    "x-failed-at": new Date().toISOString()
  };

  if (!error.nonRetryable && attempt < getMaxAttempts()) {
    channel.sendToQueue(queueConfig.retryQueue, message.content, {
      persistent: true,
      contentType: message.properties.contentType || "application/json",
      headers: { ...headers, "x-retry-count": attempt }
    });
    console.warn(`Retry scheduled for ${queueConfig.queueName}; next delivery is attempt ${attempt + 1}`);
  } else {
    channel.sendToQueue(queueConfig.dlqQueue, message.content, {
      persistent: true,
      contentType: message.properties.contentType || "application/json",
      headers: {
        ...headers,
        "x-retry-count": retryCount,
        "x-final-attempt": attempt,
        "x-failure-reason": String(error.message || error).slice(0, 1000)
      }
    });
    console.error(`Message moved to ${queueConfig.dlqQueue} after ${attempt} attempt(s): ${error.message}`);
  }
  channel.ack(message);
}

module.exports = { declareResilientQueue, parseEvent, retryOrDeadLetter };
