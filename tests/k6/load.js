import http from "k6/http";
import { sleep } from "k6";
import { BASE, AUTH_HEADERS, TEST_PRODUCT_ID, TEST_CUSTOMER_ID } from "./common.js";

export const options = {
  stages: [
    { duration: "10s", target: 30 },
    { duration: "40s", target: 30 },
    { duration: "10s", target: 0  },
  ],
  thresholds: {},   // no thresholds during diagnosis
};

const errorLog = {};

export default function () {
  const rand = Math.random();
  let res, tag;

  if (rand < 0.5) {
    tag = "list-products";
    res = http.get(`${BASE.product}/api/v1/products`, { tags: { name: tag } });
  } else if (rand < 0.8) {
    tag = "get-product";
    res = http.get(`${BASE.product}/api/v1/products/${TEST_PRODUCT_ID}`, { tags: { name: tag } });
  } else {
    tag = "customer-orders";
    res = http.get(
      `${BASE.order}/api/v1/orders/customer/${TEST_CUSTOMER_ID}`,
      { headers: AUTH_HEADERS, tags: { name: tag } }
    );
  }

  if (res.status >= 300) {
    const key = `${tag}-${res.status}`;
    errorLog[key] = (errorLog[key] || 0) + 1;
    if (errorLog[key] <= 20) {
      console.log(`[ERROR] ${tag} → ${res.status} (${res.timings.duration}ms)`);
      console.log(`        body: ${(res.body || "").slice(0, 300)}`);
    }
  }

  sleep(Math.random() * 2 + 0.5);
}