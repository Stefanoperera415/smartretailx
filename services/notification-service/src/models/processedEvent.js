const mongoose = require("mongoose");

const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    processedAt: { type: Date, default: Date.now }
  },
  { collection: "processed_events" }
);

module.exports = mongoose.model("ProcessedEvent", processedEventSchema);
