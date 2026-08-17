const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database:
    process.env.MYSQL_DATABASE ||
    "smartretailx_orders",

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function connectDatabase() {
  try {
    const connection = await pool.getConnection();

    console.log("Connected to MySQL");

    connection.release();
  } catch (error) {
    console.error(
      "MySQL connection failed:",
      error.message
    );

    process.exit(1);
  }
}

module.exports = {
  pool,
  connectDatabase
};