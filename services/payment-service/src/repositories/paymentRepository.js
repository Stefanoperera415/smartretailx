const { pool } = require("../config/database");

async function findAll() {
  const [rows] = await pool.execute(
    "SELECT * FROM payments ORDER BY created_at DESC"
  );

  return rows;
}

async function findById(paymentId) {
  const [rows] = await pool.execute(
    "SELECT * FROM payments WHERE payment_id = ?",
    [paymentId]
  );

  return rows[0] || null;
}

async function findByOrderId(orderId) {
  const [rows] = await pool.execute(
    "SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC",
    [orderId]
  );

  return rows;
}

async function create(payment) {
  await pool.execute(
    `
    INSERT INTO payments
    (
      payment_id,
      order_id,
      customer_id,
      amount,
      currency,
      status,
      provider,
      transaction_ref
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  return findById(payment.paymentId);
}

async function updateStatus(
  paymentId,
  status,
  transactionRef = null
) {
  await pool.execute(
    `
    UPDATE payments
    SET
      status = ?,
      transaction_ref = COALESCE(?, transaction_ref)
    WHERE payment_id = ?
    `,
    [status, transactionRef, paymentId]
  );

  return findById(paymentId);
}

module.exports = {
  findAll,
  findById,
  findByOrderId,
  create,
  updateStatus
};