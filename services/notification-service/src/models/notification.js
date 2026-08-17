const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: function () {
        return `NOTIF-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      }
    },
    // API-created notifications do not have an event. Sparse keeps their
    // existing workflow intact while enforcing one record per broker event.
    eventId: { type: String, unique: true, sparse: true, index: true },
    customerId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: [
        "ORDER_CREATED", "PAYMENT_COMPLETED", "PAYMENT_FAILED",
        "ORDER_CONFIRMED", "ORDER_FAILED", "INVENTORY_RELEASED"
      ],
      required: true
    },
    channel: { type: String, enum: ["EMAIL", "SMS", "PUSH"], default: "EMAIL" },
    subject: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    sentAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
