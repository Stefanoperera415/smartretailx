const orderRepository = require("../repositories/orderRepository");
const database = require("../config/database");
const outboxRepo = require("../repositories/outboxRepository");

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute
const STUCK_AGE_MINUTES = 15;

let timer = null;
let running = false;

async function startSagaTimeoutService() {
  if (running) return;
  running = true;
  console.log("⏰ Saga timeout watcher started");
  timer = setInterval(tick, POLL_INTERVAL_MS);
}

async function tick() {
  try {
    await reconcileStuckOrders();
  } catch (err) {
    console.error("Saga timeout tick error:", err.message);
  }
}

/**
 * Finds orders that have been PENDING for longer than STUCK_AGE_MINUTES
 * and cancels them. This protects against silently dropped events.
 *
 * In production, you'd likely want to retry before cancelling, but for
 * this prototype immediate cancellation is the safe default.
 */
async function reconcileStuckOrders() {
  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const stale = await client.query(
      `SELECT order_id, customer_id, total_amount, currency
       FROM orders
       WHERE status = 'PENDING'
         AND created_at < NOW() - INTERVAL '${STUCK_AGE_MINUTES} minutes'
       LIMIT 100
       FOR UPDATE SKIP LOCKED`
    );

    if (stale.rows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    for (const order of stale.rows) {
      await client.query(
        `UPDATE orders SET status = 'CANCELLED', updated_at = now() WHERE order_id = $1`,
        [order.order_id]
      );

      const eventId = `timeout-${order.order_id}`;
      await outboxRepo.enqueue(client, eventId, "OrderTimedOut", {
        orderId: order.order_id,
        customerId: order.customer_id,
        reason: "No downstream response within timeout window",
      });
    }

    await client.query("COMMIT");
    console.log(`⏰ Reconciled ${stale.rows.length} stale order(s)`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function stopSagaTimeoutService() {
  running = false;
  if (timer) clearInterval(timer);
}

module.exports = { startSagaTimeoutService, stopSagaTimeoutService };