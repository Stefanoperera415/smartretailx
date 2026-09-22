const database = require("../config/database");
const outboxRepo = require("../repositories/outboxRepository");
const { publishEvent } = require("../config/eventbridge");

const POLL_INTERVAL_MS = 2000;

let running = false;
let timer = null;

/**
 * Background worker: drains the outbox table and publishes each event.
 * Runs in the same process as the API; safe to run multiple instances
 * thanks to FOR UPDATE SKIP LOCKED.
 */
async function startOutboxPublisher() {
  if (running) return;
  running = true;
  console.log("📤 Outbox publisher started");
  scheduleNext(0);
}

function scheduleNext(delay) {
  if (!running) return;
  timer = setTimeout(tick, delay);
}

async function tick() {
  try {
    await drainOnce();
  } catch (err) {
    console.error("Outbox drain error:", err.message);
  } finally {
    scheduleNext(POLL_INTERVAL_MS);
  }
}

async function drainOnce() {
  const pool = database.pool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await outboxRepo.claimBatch(client, 25);
    if (batch.length === 0) {
      await client.query("COMMIT");
      return;
    }

    for (const row of batch) {
      try {
        await publishEvent(row.event_type, row.payload, { eventId: row.event_id });
        await outboxRepo.markPublished(client, row.event_id);
      } catch (err) {
        console.error(`Failed to publish ${row.event_type} (${row.event_id}):`, err.message);
        await outboxRepo.markFailed(client, row.event_id, err.message);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function stopOutboxPublisher() {
  running = false;
  if (timer) clearTimeout(timer);
}

module.exports = { startOutboxPublisher, stopOutboxPublisher };