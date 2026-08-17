const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port :process.env.MYSQL_PORT || 3306,
  user : process.env.MYSQL_USER ||"root",
  password : process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "smartretailx_payment",
  waitForConnections: true,
  connectionLimit:10,
  queueLimit:0
});


async function connectDatabase(){
  try{
    const connection = await pool.getConnection();
    console.log("Connected to MYSQL");
    connection.release();
  }catch(e){
    console.error("MySQL connection failed:", e.message);
    process.exit(1);
  }
}

module.exports = {
  pool,
  connectDatabase
};