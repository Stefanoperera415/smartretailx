export const API_URLS = {
  user: import.meta.env.VITE_USER_SERVICE_URL || 'http://localhost:3001',
  product: import.meta.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:3002',
  order: import.meta.env.VITE_ORDER_SERVICE_URL || 'http://localhost:3003',
  inventory: import.meta.env.VITE_INVENTORY_SERVICE_URL || 'http://localhost:3004',
  payment: import.meta.env.VITE_PAYMENT_SERVICE_URL || 'http://localhost:3005',
  notification: import.meta.env.VITE_NOTIFICATION_SERVICE_URL || 'http://localhost:3006',
};