const Notification = require("../models/notification");

async function getNotifications(req, res) {
  try {
    const {
      customerId,
      status
    } = req.query;

    const filter = {};

    if (customerId) {
      filter.customerId = customerId;
    }

    if (status) {
      filter.status = status;
    }

    const notifications =
      await Notification.find(filter)
        .sort({ createdAt: -1 });

    return res.status(200).json({
      data: notifications
    });
  } catch (error) {
    console.error(
      "Get notifications error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to retrieve notifications"
    });
  }
}

async function getNotificationById(req, res) {
  try {
    const notification =
      await Notification.findOne({
        notificationId:
          req.params.notificationId
      });

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    return res.status(200).json({
      data: notification
    });
  } catch (error) {
    console.error(
      "Get notification error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to retrieve notification"
    });
  }
}

async function createNotification(req, res) {
  try {
    const {
      customerId,
      type,
      channel,
      message
    } = req.body;

    if (
      !customerId ||
      !type ||
      !channel ||
      !message
    ) {
      return res.status(400).json({
        error:
          "customerId, type, channel and message are required"
      });
    }

    const notification =
      await Notification.create({
        notificationId:
          `NOTIF${Date.now()}`,
        customerId,
        type,
        channel,
        message,
        status: "PENDING"
      });

    return res.status(201).json({
      data: notification
    });
  } catch (error) {
    console.error(
      "Create notification error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to create notification"
    });
  }
}

async function markAsRead(req, res) {
  try {
    const notification =
      await Notification.findOneAndUpdate(
        {
          notificationId:
            req.params.notificationId
        },
        {
          status: "READ",
          readAt: new Date()
        },
        {
          new: true
        }
      );

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    return res.status(200).json({
      data: notification
    });
  } catch (error) {
    console.error(
      "Mark notification read error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to update notification"
    });
  }
}

async function sendNotification(req, res) {
  try {
    const notification =
      await Notification.findOne({
        notificationId:
          req.params.notificationId
      });

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found"
      });
    }

    if (notification.status === "SENT") {
      return res.status(409).json({
        error:
          "Notification has already been sent"
      });
    }

    // Mock delivery for local development.
    console.log(
      `Sending ${notification.channel} notification:`,
      notification.message
    );

    notification.status = "SENT";

    await notification.save();

    return res.status(200).json({
      message:
        "Notification sent successfully",
      data: notification
    });
  } catch (error) {
    console.error(
      "Send notification error:",
      error
    );

    return res.status(500).json({
      error:
        "Failed to send notification"
    });
  }
}

module.exports = {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification
};