import http from "k6/http";
import { group, sleep, check } from "k6";
import {
  BASE, AUTH_HEADERS, TEST_PRODUCT_ID, TEST_CUSTOMER_ID,
} from "./common.js";

export const options = {
  scenarios: {
    browser_journey: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 20 },
        { duration: "3m", target: 20 },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "group_duration{group:::journey}": ["p(95)<10000"],
  },
};

export default function () {
  group("journey", () => {
    // Step 1 — browse catalog
    const catalog = http.get(`${BASE.product}/api/v1/products`);
    check(catalog, { "catalog loaded": (r) => r.status === 200 });
    sleep(1);

    // Step 2 — view a specific product
    const detail = http.get(`${BASE.product}/api/v1/products/${TEST_PRODUCT_ID}`);
    check(detail, { "product loaded": (r) => r.status === 200 });
    sleep(1);

    // Step 3 — check their orders
    const orders = http.get(
      `${BASE.order}/api/v1/orders/customer/${TEST_CUSTOMER_ID}`,
      { headers: AUTH_HEADERS }
    );
    check(orders, { "orders loaded": (r) => r.status === 200 });
    sleep(1);
  });
}