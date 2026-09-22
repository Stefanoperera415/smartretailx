import api from "./api";
import { API_URLS } from "./config";

export const getAllInventory = () =>
  api.get(`${API_URLS.inventory}/api/v1/inventory`);

export const getInventoryByProduct = (productId) =>
  api.get(`${API_URLS.inventory}/api/v1/inventory/${productId}`);

export const getInventoryByProductWarehouse = (productId, warehouseId) =>
  api.get(`${API_URLS.inventory}/api/v1/inventory/${productId}/${warehouseId}`);

export const updateInventory = (productId, data) =>
  api.patch(`${API_URLS.inventory}/api/v1/inventory/${productId}`, data);

export const reserveInventory = (productId, data) =>
  api.post(`${API_URLS.inventory}/api/v1/inventory/${productId}/reserve`, data);

export const releaseInventory = (productId, data) =>
  api.post(`${API_URLS.inventory}/api/v1/inventory/${productId}/release`, data);

export const deleteInventory = (productId, warehouseId) =>
  api.delete(`${API_URLS.inventory}/api/v1/inventory/${productId}/${warehouseId}`);

// --- NEW: Warehouse CRUD ---
export const getWarehouses = () =>
  api.get(`${API_URLS.inventory}/api/v1/warehouses`);

export const createWarehouse = (data) =>
  api.post(`${API_URLS.inventory}/api/v1/warehouses`, data);

export const updateWarehouse = (warehouseId, data) =>
  api.put(`${API_URLS.inventory}/api/v1/warehouses/${warehouseId}`, data);

export const deleteWarehouse = (warehouseId) =>
  api.delete(`${API_URLS.inventory}/api/v1/warehouses/${warehouseId}`);