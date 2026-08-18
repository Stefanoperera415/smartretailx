const { pool } = require("../config/database");

async function migrate() {
  try {
    // Check if password_hash column exists
    const [rows] = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'password_hash'
    `);

    if (rows[0].count === 0) {
      console.log("Adding password_hash column...");
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN password_hash VARCHAR(255) NOT NULL
      `);
      console.log("Column added successfully.");
    } else {
      console.log("password_hash column already exists.");
    }

    // Also ensure table exists (optional)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(50) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        role ENUM('CUSTOMER','STAFF','ADMIN') DEFAULT 'CUSTOMER',
        status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("Migration completed.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }
}

migrate();