const database = require("../config/database");

// Helper to parse JSONB shipping_address (already an object)
function parseJson(value) {
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
}

async function findItems(orderId) {
  const pool = database.pool;
  const result = await pool.query(
    `
    SELECT order_item_id AS "orderItemId",
           product_id AS "productId",
           quantity,
           unit_price AS "unitPrice",
           subtotal
    FROM order_items
    WHERE order_id = $1
    ORDER BY order_item_id ASC
    `,
    [orderId]
  );
  return result.rows;
}

// ---- ORDER QUERIES ----
async function findAll() {
  const pool = database.pool;
  const result = await pool.query(`
    SELECT order_id AS "orderId",
           customer_id AS "customerId",
           status,
           total_amount AS "totalAmount",
           currency,
           shipping_address AS "shippingAddress",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM orders
    ORDER BY created_at DESC
  `);

  const orders = result.rows;
  for (const order of orders) {
    order.shippingAddress = parseJson(order.shippingAddress);
    order.items = await findItems(order.orderId);
  }
  return orders;
}

async function findById(orderId) {
  const pool = database.pool;
  const result = await pool.query(
    `
    SELECT order_id AS "orderId",
           customer_id AS "customerId",
           status,
           total_amount AS "totalAmount",
           currency,
           shipping_address AS "shippingAddress",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM orders
    WHERE order_id = $1
    `,
    [orderId]
  );
  if (result.rows.length === 0) return null;

  const order = result.rows[0];
  order.shippingAddress = parseJson(order.shippingAddress);
  order.items = await findItems(orderId);
  return order;
}

async function findByCustomerId(customerId) {
  const pool = database.pool;
  const result = await pool.query(
    `
    SELECT order_id AS "orderId",
           customer_id AS "customerId",
           status,
           total_amount AS "totalAmount",
           currency,
           shipping_address AS "shippingAddress",
           created_at AS "createdAt",
           updated_at AS "updatedAt"
    FROM orders
    WHERE customer_id = $1
    ORDER BY created_at DESC
    `,
    [customerId]
  );
  const orders = result.rows;
  for (const order of orders) {
    order.shippingAddress = parseJson(order.shippingAddress);
    order.items = await findItems(order.orderId);
  }
  return orders;
}

async function create(order) {
  const pool = database.pool;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insert order (shipping_address as JSONB)
    await client.query(
      `
      INSERT INTO orders
        (order_id, customer_id, status, total_amount, currency, shipping_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        order.orderId,
        order.customerId,
        order.status,
        order.totalAmount,
        order.currency,
        order.shippingAddress, // object – pg will stringify to JSONB
      ]
    );

    // Insert items
    for (const item of order.items) {
      await client.query(
        `
        INSERT INTO order_items
          (order_id, product_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          order.orderId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.subtotal,
        ]
      );
    }

    await client.query("COMMIT");
    return findById(order.orderId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateStatus(orderId, status) {
  const pool = database.pool;
  await pool.query(
    `
    UPDATE orders
    SET status = $1
    WHERE order_id = $2
    `,
    [status, orderId]
  );
  return findById(orderId);
}

module.exports = {
  findAll,
  findById,
  findByCustomerId,
  create,
  updateStatus,
};