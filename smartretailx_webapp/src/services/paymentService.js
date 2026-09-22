import api from "./api";
import { API_URLS } from "./config";

export const createPayment = (paymentData) =>
  api.post(`${API_URLS.payment}/api/v1/payments`, paymentData);

export const getPayments = () =>
  api.get(`${API_URLS.payment}/api/v1/payments`);

export const getPaymentById = (paymentId) =>
  api.get(`${API_URLS.payment}/api/v1/payments/${paymentId}`);

export const refundPayment = (paymentId) =>
  api.post(`${API_URLS.payment}/api/v1/payments/${paymentId}/refund`);

// --- NEW: Stripe integration ---

export const createPaymentIntent = (data) =>
  api.post(`${API_URLS.payment}/api/v1/payments/create-payment-intent`, data);

export const confirmPayment = (data) =>
  api.post(`${API_URLS.payment}/api/v1/payments/confirm-payment`, data);