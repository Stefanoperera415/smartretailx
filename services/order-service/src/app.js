require("dotenv").config();

const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const { connectEventBridge } = require("./config/eventbridge");
const { startOrderConsumer } = require("./events/orderConsumer");
const { startOutboxPublisher } = require("./service/outboxPublisher");
const { startSagaTimeoutService } = require("./service/sagaTimeoutService");

const orderRoutes = require("./routes/orders");
const { connectDatabase } = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3003;
const swaggerDocument = YAML.load("./src/docs/openapi.yml");

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "order-service",
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/v1/orders", orderRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  await connectEventBridge();
  await connectDatabase();
  await startOrderConsumer();
  startOutboxPublisher();
  startSagaTimeoutService();

  app.listen(PORT, () => {
    console.log(`Order service running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});