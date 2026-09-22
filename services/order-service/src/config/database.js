require("dotenv").config();

const { Pool } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

async function withRetry(fn, maxAttempts = 5, delay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`Connection attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
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
      hostname: host,
      port: port,
      username: user,
      region: process.env.AWS_REGION || "ap-south-1",
    });
    password = await signer.getAuthToken();
  }

  return new Pool({
    host,
    port,
    user,
    password,
    database,
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

    // Refresh IAM token every 10 minutes (tokens expire at 15)
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
    CREATE TABLE IF NOT EXISTS orders (
      order_id VARCHAR(50) PRIMARY KEY,
      customer_id VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      total_amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
      shipping_address JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_item_id SERIAL PRIMARY KEY,
      order_id VARCHAR(50) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      product_id VARCHAR(50) NOT NULL,
      product_name VARCHAR(255),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price DECIMAL(10,2) NOT NULL,
      subtotal DECIMAL(10,2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ✅ NEW: transactional outbox for reliable event publication
    CREATE TABLE IF NOT EXISTS outbox (
      event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMP WITH TIME ZONE,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
      ON outbox (created_at)
      WHERE published_at IS NULL;
  `);

  await pool.query(`
    ALTER TABLE order_items
      ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
    CREATE TRIGGER update_orders_updated_at
      BEFORE UPDATE ON orders
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log("Order database schema verified (tables + outbox + product_name ensured).");
}

module.exports = {
  get pool() { return pool; },
  connectDatabase,
};