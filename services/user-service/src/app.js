const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { connectDatabase } = require("./config/database");
const cors = require("cors");
require("dotenv").config();
const path = require("path");

const swaggerDocument = YAML.load(path.join(__dirname, "docs/openapi.yml"));

const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check (public)
app.get("/health", (req, res) => {
  res.status(200).json({
    service: "user-service",
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

// Swagger UI (public)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Auth routes (public)
app.use("/auth", authRoutes);

// API routes (protected by middleware inside users.js)
app.use("/api/v1/users", userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`User service running on port ${PORT}`);
  });
}

startServer();