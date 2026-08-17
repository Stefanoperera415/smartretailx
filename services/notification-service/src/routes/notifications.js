const express = require("express");

const {
  getNotifications,
  getNotificationById,
  createNotification,
  markAsRead,
  sendNotification
} = require(
  "../controllers/notificationController"
);

const router = express.Router();

router.get(
  "/",
  getNotifications
);

router.post(
  "/",
  createNotification
);

router.get(
  "/:notificationId",
  getNotificationById
);

router.patch(
  "/:notificationId/read",
  markAsRead
);

router.post(
  "/:notificationId/send",
  sendNotification
);

module.exports = router;