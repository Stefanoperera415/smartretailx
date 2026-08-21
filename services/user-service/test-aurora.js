require("dotenv").config();

const { Client } = require("pg");
const { Signer } = require("@aws-sdk/rds-signer");

async function testConnection() {
  const signer = new Signer({
    hostname: process.env.PG_HOST,
    port: 5432,
    username: process.env.PG_USER,
    region: "ap-south-1",
  });

  console.log("Generating IAM authentication token...");

  const token = await signer.getAuthToken();

  console.log("IAM token generated successfully.");

  const client = new Client({
    host: process.env.PG_HOST,
    port: 5432,
    user: process.env.PG_USER,
    password: token,
    database: process.env.PG_DATABASE,
    ssl: {
      rejectUnauthorized: false,
    },
    connectionTimeoutMillis: 15000,
  });

  console.log("Connecting to Aurora...");

  await client.connect();

  console.log("SUCCESS: Connected to Aurora PostgreSQL!");

  const result = await client.query("SELECT NOW();");

  console.log("Database time:", result.rows[0]);

  await client.end();
}

testConnection().catch((error) => {
  console.error("CONNECTION TEST FAILED:");
  console.error(error);
});