const notificationRepo = require("../repositories/notificationRepository");

async function getNotifications(req, res) {
  try {
    const { customerId, status } = req.query;
    const filters = {};
    if (customerId) filters.customerId = customerId;
    if (status) filters.status = status;

    const notifications = await notificationRepo.findAll(filters);
    return res.status(200).json({ data: notifications });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ error: "Failed to retrieve notifications" });
  }
}

async function getNotificationById(req, res) {
  try {
    const notification = await notificationRepo.findById(req.params.notificationId);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    return res.status(200).json({ data: notification });
  } catch (error) {
    console.error("Get notification error:", error);
    return res.status(500).json({ error: "Failed to retrieve notification" });
  }
}

async function createNotification(req, res) {
  try {
    const { customerId, type, channel, message } = req.body;
    if (!customerId || !type || !channel || !message) {
      return res.status(400).json({ error: "customerId, type, channel and message are required" });
    }

    const notification = {
      notificationId: `NOTIF${Date.now()}`,
      customerId,
      type,
      channel,
      message,
      status: "PENDING",
    };

    const created = await notificationRepo.create(notification);
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error("Create notification error:", error);
    return res.status(500).json({ error: "Failed to create notification" });
  }
}

async function markAsRead(req, res) {
  try {
    const notificationId = req.params.notificationId;
    const existing = await notificationRepo.findById(notificationId);
    if (!existing) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const updated = await notificationRepo.updateStatus(notificationId, "READ", { readAt: new Date().toISOString() });
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Failed to update notification" });
  }
}

async function sendNotification(req, res) {
  try {
    const notificationId = req.params.notificationId;
    const existing = await notificationRepo.findById(notificationId);
    if (!existing) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (existing.status === "SENT") {
      return res.status(409).json({ error: "Notification has already been sent" });
    }

    // Mock delivery – simulate sending
    console.log(`Sending ${existing.channel} notification:`, existing.message);

    const updated = await notificationRepo.updateStatus(notificationId, "SENT", { sentAt: new Date().toISOString() });
    return res.status(200).json({ message: "Notification sent successfully", data: updated });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({ error: "Failed to send notification" });
  }
}

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification,
};