const express = require("express");
const cors = require("cors");
require("dotenv").config();
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const { connectDatabase } = require("./config/database");
const { startPaymentConsumer } = require("./events/paymentConsumer");
const paymentRoutes = require("./routes/payments");

const app = express();
const PORT = process.env.PORT || 3005;
const swaggerDocument = YAML.load("./src/docs/openapi.yml");

app.use(cors());
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
  await connectDatabase();          // creates tables if missing
  await startPaymentConsumer();     // only ONE call now
  app.listen(PORT, () => console.log(`Payment service running on port ${PORT}`));
}

startServer();