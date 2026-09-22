import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";

// Read from environment variables set by run scripts
export const BASE = {
  product: __ENV.PRODUCT_URL || "http://localhost:3002",
  order: __ENV.ORDER_URL || "http://localhost:3003",
  inventory: __ENV.INVENTORY_URL || "http://localhost:3004",
  notification: __ENV.NOTIFICATION_URL || "http://localhost:3006",
};

export const AUTH_HEADERS = {
  Authorization: `Bearer ${__ENV.AUTH_TOKEN || ""}`,
  "Content-Type": "application/json",
};

export const JSON_HEADERS = {
  "Content-Type": "application/json",
};

export const TEST_PRODUCT_ID = __ENV.TEST_PRODUCT_ID || "P0000000000000";
export const TEST_CUSTOMER_ID = __ENV.TEST_CUSTOMER_ID || "test-customer";

// Simple unique order ID generator so parallel VUs don't collide
export function uniqueOrderId() {
  return `ORD-${__VU}-${__ITER}-${Date.now()}`;
}

// A single order payload — assumes a product already exists at TEST_PRODUCT_ID
export function orderPayload() {
  return JSON.stringify({
    customerId: TEST_CUSTOMER_ID,
    items: [{ productId: TEST_PRODUCT_ID, quantity: 1 }],
    shippingAddress: {
      street: "1 Load Test Lane",
      city: "Testville",
      postalCode: "TEST1",
      country: "United Kingdom",
      countryCode: "GB",
    },
    currency: "GBP",
  });
}

export function assertJson(res, expectedStatus = 200) {
  return check(res, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    "body is JSON": (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
    "response < 5s": (r) => r.timings.duration < 5000,
  });
}