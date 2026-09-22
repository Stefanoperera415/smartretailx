const database = require("../config/database");

function parseJson(value) {
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return value; }
}

// ✅ Single query for items of MANY orders
async function findItemsForOrders(orderIds) {
  if (orderIds.length === 0) return {};
  const pool = database.pool;
  const result = await pool.query(
    `
    SELECT order_item_id AS "orderItemId",
           order_id       AS "orderId",
           product_id     AS "productId",
           product_name   AS "productName",
           quantity,
           unit_price     AS "unitPrice",
           subtotal
    FROM order_items
    WHERE order_id = ANY($1::varchar[])
    ORDER BY order_item_id ASC
    `,
    [orderIds]
  );

  // Group by orderId for O(1) lookup
  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.orderId]) grouped[row.orderId] = [];
    grouped[row.orderId].push(row);
  }
  return grouped;
}

// ✅ Single query for items of ONE order (kept for compatibility)
async function findItems(orderId) {
  const pool = database.pool;
  const result = await pool.query(
    `
    SELECT order_item_id AS "orderItemId",
           product_id     AS "productId",
           product_name   AS "productName",
           quantity,
           unit_price     AS "unitPrice",
           subtotal
    FROM order_items
    WHERE order_id = $1
    ORDER BY order_item_id ASC
    `,
    [orderId]
  );
  return result.rows;
}

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
  if (orders.length === 0) return orders;

  // ✅ ONE query instead of N
  const itemsByOrder = await findItemsForOrders(orders.map((o) => o.orderId));

  for (const order of orders) {
    order.shippingAddress = parseJson(order.shippingAddress);
    order.items = itemsByOrder[order.orderId] || [];
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
    LIMIT 100  -- ✅ Cap the result set
    `,
    [customerId]
  );

  const orders = result.rows;
  if (orders.length === 0) return orders;

  const itemsByOrder = await findItemsForOrders(orders.map((o) => o.orderId));

  for (const order of orders) {
    order.shippingAddress = parseJson(order.shippingAddress);
    order.items = itemsByOrder[order.orderId] || [];
  }
  return orders;
}

async function create(order) {
  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO orders (order_id, customer_id, status, total_amount, currency, shipping_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [order.orderId, order.customerId, order.status, order.totalAmount, order.currency, order.shippingAddress]
    );

    for (const item of order.items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.orderId, item.productId, item.productName || null, item.quantity, item.unitPrice, item.subtotal]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();  // ✅ Release BEFORE calling findById
  }
  // ✅ Now call findById after the client is released
  return findById(order.orderId);
}

async function updateStatus(orderId, status) {
  const pool = database.pool;
  await pool.query(`UPDATE orders SET status = $1 WHERE order_id = $2`, [status, orderId]);
  return findById(orderId);
}

module.exports = { findAll, findById, findByCustomerId, create, updateStatus };