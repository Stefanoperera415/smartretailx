import http from "k6/http";
import { sleep } from "k6";
import {
  BASE,
  AUTH_HEADERS,
  TEST_PRODUCT_ID,
  validateSetup,
} from "./common.js";

export const options = {
  stages: [
    { duration: "1m",  target: 10  },
    { duration: "2m",  target: 50  },
    { duration: "2m",  target: 100 },
    { duration: "2m",  target: 200 },
    { duration: "1m",  target: 0   },
  ],
  // No thresholds — we want to observe failure, not fail the run.
};

export function setup() {
  return validateSetup();
}

export default function () {
  const rand = Math.random();
  if (rand < 0.6) {
    http.get(`${BASE.product}/api/v1/products`, {
      tags: { name: "list-products" },
    });
  } else if (rand < 0.8) {
    http.get(`${BASE.product}/api/v1/products/${TEST_PRODUCT_ID}`, {
      tags: { name: "get-product" },
    });
  } else {
    http.get(`${BASE.order}/api/v1/orders`, {
      headers: AUTH_HEADERS,
      tags: { name: "list-orders" },
    });
  }
  sleep(0.2);
}