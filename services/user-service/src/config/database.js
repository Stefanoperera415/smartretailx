require("dotenv").config();

const { Pool, Client } = require("pg");
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

// ---------- Custom Client with automatic IAM token refresh ----------
class IamAuthClient extends Client {
  constructor(config) {
    super(config);
    this._host = config.host;
    this._port = config.port || 5432;
    this._user = config.user;
    this._region = config.region || process.env.AWS_REGION || "ap-south-1";
    this._signer = new Signer({
      hostname: this._host,
      port: this._port,
      username: this._user,
      region: this._region,
    });
  }

  async connect() {
    // Generate a fresh IAM token for each connection
    const token = await this._signer.getAuthToken();
    this.password = token;
    return super.connect();
  }
}

// ---------- Pool factory ----------
async function createPool() {
  const host = process.env.PG_HOST;
  const port = Number(process.env.PG_PORT) || 5432;
  const user = process.env.PG_USER;
  const database = process.env.PG_DATABASE || "postgres";

  if (process.env.PG_PASSWORD) {
    // Password authentication (fallback)
    console.log("Using password authentication (PG_PASSWORD provided)");
    return new Pool({
      host,
      port,
      user,
      password: process.env.PG_PASSWORD,
      database,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
  }

  console.log("Using IAM authentication with token refresh per connection");

  // Create a pool that uses our custom client
  const pool = new Pool({
    host,
    port,
    user,
    password: "placeholder", // will be replaced by custom client
    database,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  // Override the internal client factory to use IamAuthClient
  pool._createClient = function () {
    return new IamAuthClient({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      database: this.options.database,
      password: this.options.password,
      ssl: this.options.ssl,
      region: process.env.AWS_REGION || "ap-south-1",
    });
  };

  return pool;
}

let pool;

// ---------- Public connect function ----------
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
      console.log("Connected to Aurora PostgreSQL (User Service)");
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

// ---------- Schema initialisation ----------
async function initializeDatabase() {
  await pool.query(`
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
  console.log("Database schema verified (users table created if missing).");
}

// ---------- Export ----------
module.exports = {
  get pool() { return pool; },
  connectDatabase,
};