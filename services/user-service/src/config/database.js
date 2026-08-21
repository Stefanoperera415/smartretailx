require("dotenv").config();

const { Pool } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

// ---------- Retry helper ----------
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

// ---------- Pool factory ----------
async function createPool(forcePassword = false) {
  const host = process.env.PG_HOST;
  const port = Number(process.env.PG_PORT) || 5432;
  const user = process.env.PG_USER;
  const database = process.env.PG_DATABASE || "postgres";

  let password;
  if (process.env.PG_PASSWORD) {
    password = process.env.PG_PASSWORD;
    console.log("Using password authentication (PG_PASSWORD provided)");
  } else {
    console.log("Using IAM authentication – generating fresh token");
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

// ---------- Global pool and refresh timer ----------
let currentPool = null;
let refreshTimer = null;
let isRefreshing = false;

// ---------- Refresh logic ----------
async function refreshPool() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    console.log("🔄 Refreshing IAM token and creating new pool...");
    const newPool = await createPool();

    // If we have an old pool, we'll drain it later.
    const oldPool = currentPool;

    // Swap the pool immediately – new requests use the new pool.
    currentPool = newPool;

    // Gracefully drain old pool (let existing connections finish).
    if (oldPool) {
      setTimeout(() => {
        console.log("🧹 Draining old pool...");
        oldPool.end().catch(err => console.error("Error draining old pool:", err));
      }, 5000); // Wait 5 seconds to let active queries finish.
    }

    console.log("✅ Pool refreshed successfully.");
  } catch (error) {
    console.error("❌ Failed to refresh pool:", error);
  } finally {
    isRefreshing = false;
  }
}

// ---------- Public connect ----------
async function connectDatabase() {
  try {
    // Initial pool creation with retry
    currentPool = await withRetry(async () => {
      const pool = await createPool();
      // Test connection
      const client = await pool.connect();
      const result = await client.query(`
        SELECT current_database() AS database,
               inet_server_addr() AS server_ip,
               inet_server_port() AS server_port,
               version() AS postgres_version
      `);
      console.log("========================================");
      console.log("✅ Connected to Aurora PostgreSQL");
      console.log("Database:", result.rows[0].database);
      console.log("Server IP:", result.rows[0].server_ip);
      console.log("Server Port:", result.rows[0].server_port);
      console.log("PostgreSQL Version:", result.rows[0].postgres_version);
      console.log("========================================");
      client.release();
      return pool;
    }, 5, 2000);

    await initializeDatabase();

    // Start the refresh timer (10 minutes = 600000 ms, less than 15 min expiry)
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    refreshTimer = setInterval(refreshPool, REFRESH_INTERVAL_MS);
    console.log(`⏱️ Pool refresh timer set for every ${REFRESH_INTERVAL_MS / 1000} seconds.`);
  } catch (error) {
    console.error("❌ Aurora PostgreSQL connection failed:", error);
    process.exit(1);
  }
}

// ---------- Schema initialisation ----------
async function initializeDatabase() {
  await currentPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(50) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      role VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
      status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);
  console.log("✅ Database schema verified (users table created if missing).");
}

// ---------- Export ----------
module.exports = {
  get pool() {
    return currentPool;
  },
  connectDatabase,
};