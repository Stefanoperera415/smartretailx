import http from "k6/http";
import { check, group, sleep } from "k6";
import {
  BASE,
  AUTH_HEADERS,
  TEST_PRODUCT_ID,
  TEST_CUSTOMER_ID,
  orderPayload,
  assertJson,
  validateSetup,
} from "./common.js";

export const options = {
  vus: 1,
  iterations: 1,                 // functional, not load
  thresholds: { checks: ["rate>0.95"] },
};

export function setup() {
  return validateSetup();
}

export default function () {
  group("Product Service — public reads", () => {
    const list = http.get(`${BASE.product}/api/v1/products`);
    assertJson(list, 200);
    check(list, { "list has data[]": (r) => Array.isArray(r.json()?.data) });

    const one = http.get(`${BASE.product}/api/v1/products/${TEST_PRODUCT_ID}`);
    assertJson(one, 200);
    check(one, {
      "product has productId": (r) => !!r.json()?.data?.productId,
      "product has numeric price": (r) => typeof r.json()?.data?.price === "number",
    });

    const missing = http.get(`${BASE.product}/api/v1/products/DOES_NOT_EXIST`);
    check(missing, { "unknown product → 404": (r) => r.status === 404 });
  });

  group("Product Service — categories", () => {
    const cats = http.get(`${BASE.product}/api/v1/categories`);
    assertJson(cats, 200);
    check(cats, { "categories has data[]": (r) => Array.isArray(r.json()?.data) });
  });

  group("Warehouse Service — public reads", () => {
    const list = http.get(`${BASE.inventory}/api/v1/warehouses`);
    assertJson(list, 200);
    check(list, { "warehouses has data[]": (r) => Array.isArray(r.json()?.data) });

    const missing = http.get(`${BASE.inventory}/api/v1/warehouses/DOES_NOT_EXIST`);
    check(missing, { "unknown warehouse → 404": (r) => r.status === 404 });
  });

  group("Inventory Service — reads", () => {
    const all = http.get(`${BASE.inventory}/api/v1/inventory`);
    assertJson(all, 200);
    check(all, { "inventory has data[]": (r) => Array.isArray(r.json()?.data) });

    const one = http.get(`${BASE.inventory}/api/v1/inventory/${TEST_PRODUCT_ID}`);
    if (one.status === 200) {
      check(one, {
        "each item has numeric available": (r) => {
          const d = r.json()?.data;
          return Array.isArray(d) && d.every((i) => typeof i.available === "number");
        },
      });
    } else {
      check(one, { "unknown inventory → 404": (r) => r.status === 404 });
    }
  });

  group("Order Service — auth guard", () => {
    const noAuth = http.get(`${BASE.order}/api/v1/orders`);
    check(noAuth, { "no token → 401": (r) => r.status === 401 });

    const badAuth = http.get(`${BASE.order}/api/v1/orders`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    check(badAuth, { "bad token → 401": (r) => r.status === 401 });
  });

  group("Order Service — authenticated reads", () => {
    const list = http.get(
      `${BASE.order}/api/v1/orders/customer/${TEST_CUSTOMER_ID}`,
      { headers: AUTH_HEADERS }
    );
    assertJson(list, 200);
    check(list, { "orders has data[]": (r) => Array.isArray(r.json()?.data) });
  });

  group("Order Service — create order", () => {
    const res = http.post(`${BASE.order}/api/v1/orders`, orderPayload(), {
      headers: AUTH_HEADERS,
    });
    assertJson(res, 201);

    const body = res.json();
    check(body, {
      "has data.orderId":      (b) => !!b?.data?.orderId,
      "status is PENDING":     (b) => b?.data?.status === "PENDING",
      "has items[]":           (b) => Array.isArray(b?.data?.items) && b.data.items.length > 0,
      "totalAmount > 0":       (b) => Number(b?.data?.totalAmount) > 0,
      "item has productName":  (b) => typeof b?.data?.items?.[0]?.productName === "string",
    });

    const invalid = http.post(`${BASE.order}/api/v1/orders`, "{}", {
      headers: AUTH_HEADERS,
    });
    check(invalid, { "empty body → 400": (r) => r.status === 400 });

    const noItems = http.post(
      `${BASE.order}/api/v1/orders`,
      JSON.stringify({
        customerId: TEST_CUSTOMER_ID,
        items: [],
        shippingAddress: {
          street: "x", city: "y", postalCode: "z",
          country: "UK", countryCode: "GB",
        },
      }),
      { headers: AUTH_HEADERS }
    );
    check(noItems, { "no items → 400": (r) => r.status === 400 });
  });

  group("Notification Service — reads", () => {
    const list = http.get(
      `${BASE.notification}/api/v1/notifications?customerId=${TEST_CUSTOMER_ID}`
    );
    assertJson(list, 200);
    check(list, { "notifications has data[]": (r) => Array.isArray(r.json()?.data) });

    const unread = http.get(
      `${BASE.notification}/api/v1/notifications/unread-count?customerId=${TEST_CUSTOMER_ID}`
    );
    assertJson(unread, 200);
    check(unread, { "unread is a number": (r) => typeof r.json()?.data?.unread === "number" });
  });

  group("Payment Service — reads", () => {
    const list = http.get(`${BASE.payment}/api/v1/payments`);
    assertJson(list, 200);
    check(list, { "payments has data[]": (r) => Array.isArray(r.json()?.data) });
  });

  sleep(1);
}