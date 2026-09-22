require("dotenv").config();

const { Pool } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

async function withRetry(fn, maxAttempts = 5, delay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      console.warn(`Connection attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delay * attempt));
      }
    }
  }
  throw lastError;
}

async function createPool() {
  const host = process.env.PG_HOST;
  const port = Number(process.env.PG_PORT) || 5432;
  const user = process.env.PG_USER;
  const database = process.env.PG_DATABASE || "postgres";

  let password;
  if (process.env.PG_PASSWORD) {
    password = process.env.PG_PASSWORD;
    console.log("Using password authentication (PG_PASSWORD provided)");
  } else {
    console.log("Using IAM authentication (PG_PASSWORD not set)");
    const signer = new Signer({
      hostname: host, port, username: user,
      region: process.env.AWS_REGION || "ap-south-1",
    });
    password = await signer.getAuthToken();
  }

  return new Pool({
    host, port, user, password, database,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
}

let pool;

async function connectDatabase() {
  try {
    pool = await withRetry(async () => {
      const newPool = await createPool();
      const client = await newPool.connect();
      await client.query(`SELECT 1`);
      client.release();
      return newPool;
    }, 5, 2000);

    await initializeDatabase();

    setInterval(async () => {
      try {
        console.log("🔄 Refreshing Aurora IAM token...");
        const newPool = await createPool();
        const oldPool = pool;
        pool = newPool;
        setTimeout(() => oldPool.end().catch(() => {}), 5000);
        console.log("✅ Aurora pool refreshed.");
      } catch (err) {
        console.error("Failed to refresh Aurora pool:", err.message);
      }
    }, 10 * 60 * 1000);
  } catch (error) {
    console.error("Aurora PostgreSQL connection failed:", error);
    process.exit(1);
  }
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id VARCHAR(50) PRIMARY KEY,
      order_id VARCHAR(50) NOT NULL,
      customer_id VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      provider VARCHAR(50) NOT NULL,
      transaction_ref VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS outbox (
      event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMP WITH TIME ZONE,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
      ON outbox (created_at)
      WHERE published_at IS NULL;

    CREATE TABLE IF NOT EXISTS stripe_events (
      stripe_event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ✅ NEW: staging table for PaymentIntent → items mapping
    CREATE TABLE IF NOT EXISTS pending_payment_intents (
      payment_intent_id VARCHAR(191) PRIMARY KEY,
      order_id VARCHAR(50) NOT NULL,
      customer_id VARCHAR(50) NOT NULL,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      warehouse_id VARCHAR(50),
      warehouse_mapping JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Cleanup index — staged intents older than 2 days are stale
    CREATE INDEX IF NOT EXISTS idx_pending_intents_created
      ON pending_payment_intents (created_at);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_payments_updated_at') THEN
        CREATE TRIGGER update_payments_updated_at
          BEFORE UPDATE ON payments
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END
    $$;
  `);

  console.log("Payment database schema verified.");
}

module.exports = {
  get pool() { return pool; },
  connectDatabase,
};