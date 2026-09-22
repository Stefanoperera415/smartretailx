const processedEventRepo = require("../repositories/processedEventRepository");

async function hasProcessed(eventId) {
  return processedEventRepo.hasProcessed(eventId);
}

async function markProcessed(eventId, eventType) {
  return processedEventRepo.markProcessed(eventId, eventType);
}

async function unmarkProcessed(eventId) {
  return processedEventRepo.unmarkProcessed(eventId);
}

module.exports = { hasProcessed, markProcessed, unmarkProcessed };