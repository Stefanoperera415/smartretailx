const notificationRepo = require("../repositories/notificationRepository");
const notificationBus = require("../events/notificationBus");
const { sendEmail } = require("../service/emailService");
const { getUserEmail } = require("../clients/userServiceClient");

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
    const notification = await notificationRepo.findById(
      req.params.notificationId
    );
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
      return res
        .status(400)
        .json({ error: "customerId, type, channel and message are required" });
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
    notificationBus.emit("created", created);
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
    const updated = await notificationRepo.updateStatus(notificationId, "READ", {
      readAt: new Date().toISOString(),
    });
    notificationBus.emit("updated", updated);
    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Failed to update notification" });
  }
}

/**
 * Retry delivery for a notification that's still PENDING (or resend a SENT one).
 */
async function sendNotification(req, res) {
  try {
    const notificationId = req.params.notificationId;
    const existing = await notificationRepo.findById(notificationId);
    if (!existing) {
      return res.status(404).json({ error: "Notification not found" });
    }

    const email = await getUserEmail(existing.customerId);
    if (!email) {
      return res.status(400).json({
        error: `No email address found for customer ${existing.customerId}`,
      });
    }

    const result = await sendEmail({
      to: email,
      subject: "SmartRetailX notification",
      text: existing.message,
    });

    if (!result.success) {
      const updated = await notificationRepo.updateStatus(
        notificationId,
        "PENDING",
        { lastError: result.reason || "Delivery failed" }
      );
      notificationBus.emit("updated", updated);
      return res
        .status(502)
        .json({ error: "Delivery failed", reason: result.reason, data: updated });
    }

    const updated = await notificationRepo.updateStatus(
      notificationId,
      "SENT",
      { sentAt: new Date().toISOString(), messageId: result.messageId }
    );
    notificationBus.emit("updated", updated);
    return res
      .status(200)
      .json({ message: "Notification sent successfully", data: updated });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({ error: "Failed to send notification" });
  }
}

/**
 * Server-Sent Events stream for a single customer.
 * GET /api/v1/notifications/stream?customerId=XYZ
 */
async function streamNotifications(req, res) {
  const { customerId } = req.query;
  if (!customerId) {
    return res.status(400).json({ error: "customerId is required" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }, 25000);

  const onCreated = (n) => {
    if (n.customerId !== customerId) return;
    res.write("event: notification\n");
    res.write(`data: ${JSON.stringify(n)}\n\n`);
  };

  const onUpdated = (n) => {
    if (n.customerId !== customerId) return;
    res.write("event: updated\n");
    res.write(`data: ${JSON.stringify(n)}\n\n`);
  };

  notificationBus.on("created", onCreated);
  notificationBus.on("updated", onUpdated);

  req.on("close", () => {
    clearInterval(heartbeat);
    notificationBus.off("created", onCreated);
    notificationBus.off("updated", onUpdated);
  });
}


async function getUnreadCount(req, res) {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ error: "customerId is required" });
    }
    const notifications = await notificationRepo.findAll({ customerId });
    const unread = notifications.filter((n) => n.status !== "READ").length;
    return res.status(200).json({ data: { unread, total: notifications.length } });
  } catch (error) {
    console.error("Get unread count error:", error);
    return res.status(500).json({ error: "Failed to get unread count" });
  }
}

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification,
  streamNotifications,
  getUnreadCount,
};