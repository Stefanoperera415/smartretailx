require("dotenv").config();

const { Pool } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

// Retry helper (copied from order-service)
async function withRetry(fn, maxAttempts = 5, delay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`Connection attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
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
      const result = await client.query(`
        SELECT current_database() AS database,
               inet_server_addr() AS server_ip,
               inet_server_port() AS server_port,
               version() AS postgres_version
      `);
      console.log("========================================");
      console.log("Connected to Aurora PostgreSQL (Payment Service)");
      console.log("Database:", result.rows[0].database);
      console.log("Server IP:", result.rows[0].server_ip);
      console.log("Server Port:", result.rows[0].server_port);
      console.log("PostgreSQL Version:", result.rows[0].postgres_version);
      console.log("========================================");
      client.release();
      return newPool;
    }, 5, 2000);

    await initializeDatabase();
  } catch (error) {
    console.error("Aurora PostgreSQL connection failed after retries:", error);
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

    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
    CREATE TRIGGER update_payments_updated_at
      BEFORE UPDATE ON payments
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);

  console.log("Payment database schema verified (tables created if missing).");
}

module.exports = {
  get pool() { return pool; },
  connectDatabase,
};