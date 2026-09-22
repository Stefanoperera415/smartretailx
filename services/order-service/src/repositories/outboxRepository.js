const database = require("../config/database");

/**
 * Write an event to the outbox INSIDE an existing transaction.
 * Call this from within `client.query("BEGIN")...COMMIT` blocks so the event
 * publication is atomic with the domain write.
 */
async function enqueue(client, eventId, eventType, payload) {
  await client.query(
    `INSERT INTO outbox (event_id, event_type, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId, eventType, JSON.stringify(payload)]
  );
}

/**
 * Claim a batch of unpublished events for publishing.
 * Uses FOR UPDATE SKIP LOCKED so multiple worker instances don't collide.
 * Must be called inside a transaction.
 */
async function claimBatch(client, limit = 25) {
  const result = await client.query(
    `SELECT event_id, event_type, payload, attempts
     FROM outbox
     WHERE published_at IS NULL
       AND attempts < 10
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit]
  );
  return result.rows;
}

async function markPublished(client, eventId) {
  await client.query(
    `UPDATE outbox SET published_at = now() WHERE event_id = $1`,
    [eventId]
  );
}

async function markFailed(client, eventId, errorMessage) {
  await client.query(
    `UPDATE outbox
     SET attempts = attempts + 1, last_error = $2
     WHERE event_id = $1`,
    [eventId, String(errorMessage).slice(0, 1000)]
  );
}

module.exports = { enqueue, claimBatch, markPublished, markFailed };