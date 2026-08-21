const database = require("../config/database");

async function findAll() {
  const pool = database.pool;
  const result = await pool.query(`
    SELECT payment_id, order_id, customer_id, amount, currency, status,
           provider, transaction_ref, created_at, updated_at
    FROM payments
    ORDER BY created_at DESC
  `);
  return result.rows;
}

async function findById(paymentId) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT payment_id, order_id, customer_id, amount, currency, status,
            provider, transaction_ref, created_at, updated_at
     FROM payments
     WHERE payment_id = $1`,
    [paymentId]
  );
  return result.rows[0] || null;
}

async function findByOrderId(orderId) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT payment_id, order_id, customer_id, amount, currency, status,
            provider, transaction_ref, created_at, updated_at
     FROM payments
     WHERE order_id = $1
     ORDER BY created_at DESC`,
    [orderId]
  );
  return result.rows;
}

async function create(payment) {
  const pool = database.pool;
  const result = await pool.query(
    `
    INSERT INTO payments
      (payment_id, order_id, customer_id, amount, currency, status, provider, transaction_ref)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING payment_id, order_id, customer_id, amount, currency, status,
              provider, transaction_ref, created_at, updated_at
    `,
    [
      payment.paymentId,
      payment.orderId,
      payment.customerId,
      payment.amount,
      payment.currency,
      payment.status,
      payment.provider,
      payment.transactionRef || null
    ]
  );
  return result.rows[0];
}

async function updateStatus(paymentId, status, transactionRef = null) {
  const pool = database.pool;
  const result = await pool.query(
    `
    UPDATE payments
    SET status = $1,
        transaction_ref = COALESCE($2, transaction_ref)
    WHERE payment_id = $3
    RETURNING payment_id, order_id, customer_id, amount, currency, status,
              provider, transaction_ref, created_at, updated_at
    `,
    [status, transactionRef, paymentId]
  );
  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findByOrderId,
  create,
  updateStatus,
};