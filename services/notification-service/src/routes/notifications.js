const express = require("express");

const {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification,
  streamNotifications,          // ← THIS was missing
  getUnreadCount,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", getNotifications);
router.post("/", createNotification);

// ✅ SSE stream MUST come before /:notificationId to avoid being shadowed
router.get("/stream", streamNotifications);

router.get("/:notificationId", getNotificationById);
router.patch("/:notificationId/read", markAsRead);
router.post("/:notificationId/send", sendNotification);
router.get("/unread-count", getUnreadCount);  
module.exports = router;