const { pool } = require("../config/database");

async function findAll() {
  const [orders] = await pool.execute(`
    SELECT
      order_id AS orderId,
      customer_id AS customerId,
      status,
      total_amount AS totalAmount,
      currency,
      shipping_address AS shippingAddress,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM orders
    ORDER BY created_at DESC
  `);

  for (const order of orders) {
    order.items = await findItems(order.orderId);
    order.shippingAddress =
      parseJson(order.shippingAddress);
  }

  return orders;
}

async function findById(orderId) {
  const [rows] = await pool.execute(
    `
    SELECT
      order_id AS orderId,
      customer_id AS customerId,
      status,
      total_amount AS totalAmount,
      currency,
      shipping_address AS shippingAddress,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM orders
    WHERE order_id = ?
    `,
    [orderId]
  );

  if (!rows[0]) {
    return null;
  }

  const order = rows[0];

  order.shippingAddress =
    parseJson(order.shippingAddress);

  order.items = await findItems(orderId);

  return order;
}

async function findByCustomerId(customerId) {
  const [orders] = await pool.execute(
    `
    SELECT
      order_id AS orderId,
      customer_id AS customerId,
      status,
      total_amount AS totalAmount,
      currency,
      shipping_address AS shippingAddress,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM orders
    WHERE customer_id = ?
    ORDER BY created_at DESC
    `,
    [customerId]
  );

  for (const order of orders) {
    order.shippingAddress =
      parseJson(order.shippingAddress);

    order.items =
      await findItems(order.orderId);
  }

  return orders;
}

async function findItems(orderId) {
  const [items] = await pool.execute(
    `
    SELECT
      order_item_id AS orderItemId,
      product_id AS productId,
      quantity,
      unit_price AS unitPrice,
      subtotal
    FROM order_items
    WHERE order_id = ?
    ORDER BY order_item_id ASC
    `,
    [orderId]
  );

  return items;
}

async function create(order) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `
      INSERT INTO orders
      (
        order_id,
        customer_id,
        status,
        total_amount,
        currency,
        shipping_address
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        order.orderId,
        order.customerId,
        order.status,
        order.totalAmount,
        order.currency,
        JSON.stringify(order.shippingAddress)
      ]
    );

    for (const item of order.items) {
      await connection.execute(
        `
        INSERT INTO order_items
        (
          order_id,
          product_id,
          quantity,
          unit_price,
          subtotal
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          order.orderId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.subtotal
        ]
      );
    }

    await connection.commit();

    return findById(order.orderId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStatus(orderId, status) {
  await pool.execute(
    `
    UPDATE orders
    SET status = ?
    WHERE order_id = ?
    `,
    [status, orderId]
  );

  return findById(orderId);
}

function parseJson(value) {
  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

module.exports = {
  findAll,
  findById,
  findByCustomerId,
  create,
  updateStatus
};