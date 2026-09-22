import api from "./api";
import { API_URLS } from "./config";

// Auth is handled by Cognito. Call /auth/me after login to fetch (and
// just-in-time create) the local profile row in your database.
export const getMe = () =>
  api.get(`${API_URLS.user}/auth/me`);

export const getProfile = (userId) =>
  api.get(`${API_URLS.user}/api/v1/users/${userId}`);

export const updateProfile = (userId, data) =>
  api.put(`${API_URLS.user}/api/v1/users/${userId}`, data);

export const getAllUsers = () =>
  api.get(`${API_URLS.user}/api/v1/users`);

export const deleteUser = (userId) =>
  api.delete(`${API_URLS.user}/api/v1/users/${userId}`);

// ✅ NEW: change a user's role (ADMIN only)
// Backend: PUT /api/v1/users/:id/role { role: "ADMIN" | "STAFF" | "CUSTOMER" }
// This calls Cognito's AdminAddUserToGroup / AdminRemoveUserFromGroup.
export const updateUserRole = (userId, role) =>
  api.put(`${API_URLS.user}/api/v1/users/${userId}/role`, { role });