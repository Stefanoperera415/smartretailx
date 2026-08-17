const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://localhost:3001";

const PRODUCT_SERVICE_URL =
  process.env.PRODUCT_SERVICE_URL || "http://localhost:3002";

async function getUser(userId) {
  const response = await fetch(
    `${USER_SERVICE_URL}/api/v1/users/${encodeURIComponent(userId)}`
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `User service returned HTTP ${response.status}`
    );
  }

  const body = await response.json();

  return body.data;
}

async function getProduct(productId) {
  const response = await fetch(
    `${PRODUCT_SERVICE_URL}/api/v1/products/${encodeURIComponent(productId)}`
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Product service returned HTTP ${response.status}`
    );
  }

  const body = await response.json();

  return body.data;
}

module.exports = {
  getUser,
  getProduct
};