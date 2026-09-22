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