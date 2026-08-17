const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path");

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const productRoutes = require("./routes/products");
const connectDatabase = require("./config/database"); // ✅ Import database connection

const app = express();
const PORT = process.env.PORT || 3002;

const swaggerDocument = YAML.load(path.join(__dirname, "docs/openapi.yml"));

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "product-service",
    status: "UP",
    timestamp: new Date().toISOString()
  });
});

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// API routes
app.use("/api/v1/products", productRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ✅ Start server after connecting to database
async function startServer() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`Product service running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});