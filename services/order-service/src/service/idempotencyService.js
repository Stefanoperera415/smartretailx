const processedEventRepo = require("../repositories/processedEventRepository.js");

async function hasProcessed(eventId) {
  return processedEventRepo.hasProcessed(eventId);
}

async function markProcessed(eventId, eventType) {
  return processedEventRepo.markProcessed(eventId, eventType);
}

module.exports = { hasProcessed, markProcessed };