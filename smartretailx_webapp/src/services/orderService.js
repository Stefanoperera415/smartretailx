import api from "./api";
import { API_URLS } from "./config";

export const createOrder = (orderData) =>
  api.post(`${API_URLS.order}/api/v1/orders`, orderData);

export const getOrders = () =>
  api.get(`${API_URLS.order}/api/v1/orders`);

export const getOrderById = (orderId) =>
  api.get(`${API_URLS.order}/api/v1/orders/${orderId}`);

export const getOrdersByCustomer = (userId) =>
  api.get(`${API_URLS.order}/api/v1/orders/customer/${userId}`);

export const updateOrderStatus = (orderId, status) =>
  api.patch(`${API_URLS.order}/api/v1/orders/${orderId}/status`, { status });