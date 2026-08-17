const { pool } = require("../config/database");

async function ensureProcessedEventsTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id VARCHAR(191) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id)
    ) ENGINE=InnoDB
  `);
}

async function hasProcessed(eventId) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM processed_events WHERE event_id = ? LIMIT 1",
    [eventId]
  );
  return rows.length > 0;
}

async function markProcessed(eventId, eventType) {
  try {
    await pool.execute(
      "INSERT INTO processed_events (event_id, event_type) VALUES (?, ?)",
      [eventId, eventType]
    );
    return true;
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

module.exports = { ensureProcessedEventsTable, hasProcessed, markProcessed };
