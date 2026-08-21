const database = require("../config/database");

async function hasProcessed(eventId) {
  const pool = database.pool;
  const result = await pool.query(
    "SELECT 1 FROM processed_events WHERE event_id = $1 LIMIT 1",
    [eventId]
  );
  return result.rows.length > 0;
}

async function markProcessed(eventId, eventType) {
  const pool = database.pool;
  try {
    await pool.query(
      "INSERT INTO processed_events (event_id, event_type) VALUES ($1, $2)",
      [eventId, eventType]
    );
    return true;
  } catch (error) {
    // Unique violation in PostgreSQL is code '23505'
    if (error.code === '23505') return false;
    throw error;
  }
}

module.exports = { hasProcessed, markProcessed };