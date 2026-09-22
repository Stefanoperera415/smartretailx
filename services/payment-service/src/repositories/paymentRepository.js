const database = require("../config/database");

async function findAll() {
  const pool = database.pool;
  const result = await pool.query(`
    SELECT payment_id, order_id, customer_id, amount, currency, status,
           provider, transaction_ref, created_at, updated_at
    FROM payments ORDER BY created_at DESC
  `);
  return result.rows;
}

async function findById(paymentId) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT payment_id, order_id, customer_id, amount, currency, status,
            provider, transaction_ref, created_at, updated_at
     FROM payments WHERE payment_id = $1`,
    [paymentId]
  );
  return result.rows[0] || null;
}

async function findByOrderId(orderId) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT payment_id, order_id, customer_id, amount, currency, status,
            provider, transaction_ref, created_at, updated_at
     FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return result.rows;
}

async function findByTransactionRef(ref) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT payment_id, order_id, customer_id, amount, currency, status,
            provider, transaction_ref, created_at, updated_at
     FROM payments WHERE transaction_ref = $1 LIMIT 1`,
    [ref]
  );
  return result.rows[0] || null;
}

async function create(payment, withinTx) {
  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO payments
         (payment_id, order_id, customer_id, amount, currency, status, provider, transaction_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING payment_id, order_id, customer_id, amount, currency, status,
                 provider, transaction_ref, created_at, updated_at`,
      [
        payment.paymentId,
        payment.orderId,
        payment.customerId,
        payment.amount,
        payment.currency,
        payment.status,
        payment.provider,
        payment.transactionRef || null,
      ]
    );
    if (withinTx) await withinTx(client);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function updateStatus(paymentId, status, transactionRef, withinTx) {
  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE payments
       SET status = $1, transaction_ref = COALESCE($2, transaction_ref)
       WHERE payment_id = $3
       RETURNING payment_id, order_id, customer_id, amount, currency, status,
                 provider, transaction_ref, created_at, updated_at`,
      [status, transactionRef || null, paymentId]
    );
    if (withinTx) await withinTx(client);
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Stripe event dedup
// ---------------------------------------------------------------------------

async function recordStripeEvent(stripeEventId, eventType) {
  const pool = database.pool;
  const result = await pool.query(
    `INSERT INTO stripe_events (stripe_event_id, event_type)
     VALUES ($1, $2)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`,
    [stripeEventId, eventType]
  );
  return result.rowCount === 1;
}

/**
 * ✅ Remove a stripe_events row so a failed handler can be retried
 *    by Stripe's automatic webhook retries.
 */
async function deleteStripeEvent(stripeEventId) {
  const pool = database.pool;
  await pool.query(
    `DELETE FROM stripe_events WHERE stripe_event_id = $1`,
    [stripeEventId]
  );
}

// ---------------------------------------------------------------------------
// PaymentIntent item staging
// ---------------------------------------------------------------------------

/**
 * Persist the order's items at create-payment-intent time.
 * The webhook only sees PaymentIntent metadata (which is size-limited),
 * so we stash the full items separately and look them up later.
 */
async function stageIntentItems(paymentIntentId, payload) {
  const pool = database.pool;
  await pool.query(
    `INSERT INTO pending_payment_intents
       (payment_intent_id, order_id, customer_id, items, warehouse_id, warehouse_mapping)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (payment_intent_id) DO UPDATE
       SET items = EXCLUDED.items,
           warehouse_id = EXCLUDED.warehouse_id,
           warehouse_mapping = EXCLUDED.warehouse_mapping`,
    [
      paymentIntentId,
      payload.orderId,
      payload.customerId,
      JSON.stringify(payload.items || []),
      payload.warehouseId || null,
      payload.warehouseMapping ? JSON.stringify(payload.warehouseMapping) : null,
    ]
  );
}

async function getStagedIntent(paymentIntentId) {
  const pool = database.pool;
  const result = await pool.query(
    `SELECT items, warehouse_id, warehouse_mapping
     FROM pending_payment_intents WHERE payment_intent_id = $1`,
    [paymentIntentId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    items: typeof row.items === "string" ? JSON.parse(row.items) : row.items,
    warehouseId: row.warehouse_id,
    warehouseMapping:
      typeof row.warehouse_mapping === "string"
        ? JSON.parse(row.warehouse_mapping)
        : row.warehouse_mapping,
  };
}

async function clearStagedIntent(paymentIntentId) {
  const pool = database.pool;
  await pool.query(
    `DELETE FROM pending_payment_intents WHERE payment_intent_id = $1`,
    [paymentIntentId]
  );
}

module.exports = {
  findAll,
  findById,
  findByOrderId,
  findByTransactionRef,
  create,
  updateStatus,
  recordStripeEvent,
  deleteStripeEvent,
  stageIntentItems,
  getStagedIntent,
  clearStagedIntent,
};