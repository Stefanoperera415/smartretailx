import http from "k6/http";
import { check, group, sleep } from "k6";
import {
  BASE,
  AUTH_HEADERS,
  JSON_HEADERS,
  TEST_PRODUCT_ID,
  TEST_CUSTOMER_ID,   // ✅ added
  orderPayload,
  assertJson,
} from "./common.js";

export const options = {
  vus: 1,
  iterations: 1, // single pass — this is functional, not load
};

export default function () {
  group("Product Service — public reads", () => {
    const list = http.get(`${BASE.product}/api/v1/products`);
    assertJson(list, 200);

    const one = http.get(`${BASE.product}/api/v1/products/${TEST_PRODUCT_ID}`);
    assertJson(one, 200);

    const missing = http.get(`${BASE.product}/api/v1/products/DOES_NOT_EXIST`);
    check(missing, { "unknown product → 404": (r) => r.status === 404 });
  });

  group("Order Service — authenticated reads", () => {
    const list = http.get(
      `${BASE.order}/api/v1/orders/customer/${TEST_CUSTOMER_ID}`,
      { headers: AUTH_HEADERS },
    );
    assertJson(list, 200);

    const noAuth = http.get(`${BASE.order}/api/v1/orders`);
    check(noAuth, { "no token → 401": (r) => r.status === 401 });
  });

  group("Order Service — create order", () => {
    const res = http.post(`${BASE.order}/api/v1/orders`, orderPayload(), {
      headers: AUTH_HEADERS,
    });
    assertJson(res, 201);

    const body = res.json();
    check(body, {
      "has data.orderId": (b) => b?.data?.orderId,
      "status is PENDING": (b) => b?.data?.status === "PENDING",
      "has items": (b) => Array.isArray(b?.data?.items),
    });

    const invalid = http.post(`${BASE.order}/api/v1/orders`, "{}", {
      headers: AUTH_HEADERS,
    });
    check(invalid, { "empty body → 400": (r) => r.status === 400 });
  });

  sleep(1);
}
