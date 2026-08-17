const ProcessedEvent = require("../models/processEvents");

async function hasProcessed(eventId) {
  return Boolean(await ProcessedEvent.exists({ eventId }));
}

async function markProcessed(eventId, eventType) {
  try {
    await ProcessedEvent.create({ eventId, eventType });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

module.exports = { hasProcessed, markProcessed };
