const express = require("express");
const {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification,
  streamNotifications,
  getUnreadCount,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", getNotifications);
router.post("/", createNotification);

// ✅ SSE stream MUST come before /:notificationId to avoid being shadowed
router.get("/stream", streamNotifications);

// ✅ FIX: also before /:notificationId
router.get("/unread-count", getUnreadCount);

// Parameterized routes LAST
router.get("/:notificationId", getNotificationById);
router.patch("/:notificationId/read", markAsRead);
router.post("/:notificationId/send", sendNotification);

module.exports = router;