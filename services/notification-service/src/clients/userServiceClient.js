const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://localhost:3001";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

async function getUserEmail(customerId) {
  if (!customerId) return null;

  const url = `${USER_SERVICE_URL}/api/v1/users/${encodeURIComponent(customerId)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "x-internal-key": INTERNAL_API_KEY,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `getUserEmail: ${customerId} → HTTP ${res.status} ${body.slice(0, 200)}`
      );
      return null;
    }

    const body = await res.json();
    return body?.data?.email || null;
  } catch (err) {
    console.warn(`getUserEmail: fetch failed for ${customerId}:`, err.message);
    return null;
  }
}

module.exports = { getUserEmail };