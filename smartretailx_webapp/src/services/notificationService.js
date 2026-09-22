import api from "./api";
import { API_URLS } from "./config";

export const getNotifications = (filters = {}) =>
  api.get(`${API_URLS.notification}/api/v1/notifications`, { params: filters });

export const getNotificationById = (notificationId) =>
  api.get(`${API_URLS.notification}/api/v1/notifications/${notificationId}`);

export const createNotification = (notificationData) =>
  api.post(`${API_URLS.notification}/api/v1/notifications`, notificationData);

export const markNotificationRead = (notificationId) =>
  api.patch(`${API_URLS.notification}/api/v1/notifications/${notificationId}/read`);

export const sendNotification = (notificationId) =>
  api.post(`${API_URLS.notification}/api/v1/notifications/${notificationId}/send`);

// ✅ NEW: tiny payload for the bell badge
export const getUnreadCount = (customerId) =>
  api.get(`${API_URLS.notification}/api/v1/notifications/unread-count`, {
    params: { customerId },
  });

// ✅ NEW: raw SSE URL builder (used by useNotificationStream)
export const buildNotificationStreamUrl = (customerId) =>
  `${API_URLS.notification}/api/v1/notifications/stream?customerId=${encodeURIComponent(
    customerId
  )}`;