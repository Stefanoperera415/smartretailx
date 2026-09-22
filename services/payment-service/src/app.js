const express = require("express");
const cors = require("cors");
require("dotenv").config();
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const { connectDatabase } = require("./config/database");
const { connectEventBridge } = require("./config/eventbridge");
const { startPaymentConsumer } = require("./events/paymentConsumer");
const { startOutboxPublisher } = require("./services/outboxPublisher");
const { handleStripeWebhook } = require("./controllers/paymentController");
const paymentRoutes = require("./routes/payments");

const app = express();
const PORT = process.env.PORT || 3005;
const swaggerDocument = YAML.load("./src/docs/openapi.yml");

app.use(cors());

// ✅ Stripe webhook — mounted FIRST with raw body parser, before express.json().
app.post(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Regular JSON parsing for every other route.
app.use(express.json());

app.get("/health", (req, res) =>
  res.status(200).json({
    service: "payment-service",
    status: "UP",
    timestamp: new Date().toISOString(),
  })
);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/v1/payments", paymentRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  await connectEventBridge();
  await connectDatabase();
  await startPaymentConsumer();
  startOutboxPublisher();

  app.listen(PORT, () =>
    console.log(`Payment service running on port ${PORT}`)
  );
}

startServer();