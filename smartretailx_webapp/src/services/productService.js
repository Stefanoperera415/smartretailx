import api from "./api";
import { API_URLS } from "./config";

export const getAllProducts = () =>
  api.get(`${API_URLS.product}/api/v1/products`);

export const getProductById = (productId) =>
  api.get(`${API_URLS.product}/api/v1/products/${productId}`);

export const createProduct = (formData) =>
  api.post(`${API_URLS.product}/api/v1/products`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const updateProduct = (productId, formData) =>
  api.put(`${API_URLS.product}/api/v1/products/${productId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const deleteProduct = (productId) =>
  api.delete(`${API_URLS.product}/api/v1/products/${productId}`);

export const getCategories = () =>
  api.get(`${API_URLS.product}/api/v1/categories`);

export const createCategory = (data) =>
  api.post(`${API_URLS.product}/api/v1/categories`, data);

export const updateCategory = (categoryId, data) =>
  api.put(`${API_URLS.product}/api/v1/categories/${categoryId}`, data);

export const deleteCategory = (categoryId) =>
  api.delete(`${API_URLS.product}/api/v1/categories/${categoryId}`);