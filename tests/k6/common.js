import http from "k6/http";
import { check, fail } from "k6";

// ---------------------------------------------------------------------------
// Service URLs (override via -e ENV=... or by exporting in your shell)
// ---------------------------------------------------------------------------
export const BASE = {
  user:         __ENV.USER_URL         || "http://localhost:3001",
  product:      __ENV.PRODUCT_URL      || "http://localhost:3002",
  order:        __ENV.ORDER_URL        || "http://localhost:3003",
  inventory:    __ENV.INVENTORY_URL    || "http://localhost:3004",
  payment:      __ENV.PAYMENT_URL      || "http://localhost:3005",
  notification: __ENV.NOTIFICATION_URL || "http://localhost:3006",
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const TOKEN = (__ENV.AUTH_TOKEN || "").trim();

export const AUTH_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

export const JSON_HEADERS = {
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
export const TEST_PRODUCT_ID   = __ENV.TEST_PRODUCT_ID   || "P0000000000000";
export const TEST_CUSTOMER_ID  = __ENV.TEST_CUSTOMER_ID  || "test-customer";
export const TEST_WAREHOUSE_ID = __ENV.TEST_WAREHOUSE_ID || "WH01";

// ---------------------------------------------------------------------------
// Manual base64url → UTF-8 decoder (no k6/encoding dependency)
// ---------------------------------------------------------------------------
const B64URL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_LOOKUP = (() => {
  const t = {};
  for (let i = 0; i < B64URL_CHARS.length; i++) t[B64URL_CHARS[i]] = i;
  return t;
})();

function base64UrlToUtf8(input) {
  const s = String(input).replace(/=+$/, "");   // strip padding if present
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < s.length; i++) {
    const v = B64URL_LOOKUP[s[i]];
    if (v === undefined) {
      throw new Error(`invalid base64url char '${s[i]}' at index ${i}`);
    }
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }

  // UTF-8 decode (JWT payloads are ASCII, but be safe)
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp, extra;
    if (b < 0x80)                  { cp = b;        extra = 0; }
    else if ((b & 0xe0) === 0xc0)  { cp = b & 0x1f; extra = 1; }
    else if ((b & 0xf0) === 0xe0)  { cp = b & 0x0f; extra = 2; }
    else if ((b & 0xf8) === 0xf0)  { cp = b & 0x07; extra = 3; }
    else throw new Error(`invalid UTF-8 lead byte 0x${b.toString(16)} at ${i}`);

    if (i + extra >= bytes.length) throw new Error("truncated UTF-8 sequence");
    for (let j = 1; j <= extra; j++) {
      const c = bytes[i + j];
      if ((c & 0xc0) !== 0x80) {
        throw new Error("invalid UTF-8 continuation byte");
      }
      cp = (cp << 6) | (c & 0x3f);
    }
    i += extra + 1;

    if (cp < 0x10000) {
      out += String.fromCharCode(cp);
    } else {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") {
    console.error(`[jwt] token is not a string (got ${typeof token})`);
    return null;
  }

  // Defensive cleanup: strip whitespace and any surrounding quotes that a
  // shell/.env round-trip may have introduced.
  const cleaned = token.trim().replace(/^["']|["']$/g, "");

  const parts = cleaned.split(".");
  if (parts.length !== 3) {
    console.error(
      `[jwt] expected 3 dot-separated parts, got ${parts.length}. ` +
      `len=${cleaned.length}, head="${cleaned.slice(0, 30)}", ` +
      `tail="${cleaned.slice(-30)}"`
    );
    return null;
  }

  try {
    const json = base64UrlToUtf8(parts[1]);
    return JSON.parse(json);
  } catch (e) {
    console.error(`[jwt] decode failed: ${e.message}`);
    console.error(
      `[jwt] payload seg: len=${parts[1].length}, ` +
      `head="${parts[1].slice(0, 24)}", tail="${parts[1].slice(-24)}"`
    );
    return null;
  }
}

/**
 * Validate that AUTH_TOKEN exists and is not about to expire.
 * Throws (fails the k6 run) on failure so we never run 200 VUs against a
 * dead token.
 */
export function assertTokenFresh() {
  if (!TOKEN) {
    fail(
      "AUTH_TOKEN is missing. Run `npm run token` and re-source .env.tests " +
      "before running k6."
    );
  }
  const payload = decodeJwtPayload(TOKEN);
  if (!payload) {
    fail("AUTH_TOKEN is not a decodable JWT.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now + 30) {
    fail(
      `AUTH_TOKEN expired or expiring within 30s ` +
      `(exp=${payload.exp}, now=${now}, delta=${payload.exp - now}s). ` +
      `Run \`npm run token\` and re-source .env.tests.`
    );
  }
  return payload;
}

/**
 * Warn if the JWT sub doesn't match TEST_CUSTOMER_ID. Not fatal — some
 * tests still work — but the customer-scoped order endpoints will 403.
 */
export function warnIfSubMismatch(payload) {
  if (!payload?.sub) return;
  if (payload.sub !== TEST_CUSTOMER_ID) {
    console.warn(
      `⚠️  JWT sub (${payload.sub}) != TEST_CUSTOMER_ID (${TEST_CUSTOMER_ID}). ` +
      `Tests hitting /orders/customer/${TEST_CUSTOMER_ID} will return 403. ` +
      `Set TEST_CUSTOMER_ID=${payload.sub} in .env.tests to fix.`
    );
  }
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------
export function uniqueOrderId() {
  return `ORD-${__VU}-${__ITER}-${Date.now()}`;
}

export function orderPayload(overrides = {}) {
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
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------
export function assertJson(res, expectedStatus = 200) {
  return check(res, {
    [`status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    "body is JSON": (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
    "response < 5s": (r) => r.timings.duration < 5000,
  });
}

/**
 * One-shot setup used by every test file. Validates the token and forces
 * JIT provisioning of the test customer via /auth/me so createOrder()
 * doesn't fail with "Customer does not exist".
 */
export function validateSetup() {
  const payload = assertTokenFresh();
  warnIfSubMismatch(payload);

  const me = http.get(`${BASE.user}/auth/me`, {
    headers: AUTH_HEADERS,
    tags: { name: "setup-auth-me" },
  });
  if (me.status !== 200) {
    console.warn(
      `⚠️  /auth/me returned ${me.status}. Order creation may fail if the ` +
      `customer isn't provisioned. Body: ${(me.body || "").slice(0, 200)}`
    );
  }
  return { userId: payload.sub };
}