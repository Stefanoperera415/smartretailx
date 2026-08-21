require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectEventBridge } = require("./config/eventbridge");
const { startOrderConsumer } = require("./events/orderConsumer");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const orderRoutes = require("./routes/orders");
const { connectDatabase } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3003;

// Load OpenAPI YAML file
const swaggerDocument = YAML.load("./src/docs/openapi.yml");

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "order-service",
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
);

// API routes
app.use("/api/v1/orders", orderRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error",
  });
});

async function startServer() {
  // Initialize EventBridge
  await connectEventBridge();

  // Connect to Aurora PostgreSQL
  await connectDatabase();

  await startOrderConsumer();

  app.listen(PORT, () => {
    console.log(`Order service running on port ${PORT}`);
  });
}

// Handle startup errors
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});