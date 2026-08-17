const express = require("express");
const cors = require("cors");
require("dotenv").config();
const path = require("path");
const {connectRabbitMQ } = require("./config/rabbitmq");
const { startInventoryConsumer } = require("./events/inventoryConsumer");

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const connectDatabase = require("./config/database");
const inventoryRoutes = require("./routes/inventory");

const app = express();

const PORT = process.env.PORT || 3004;

const swaggerDocument = YAML.load(
  path.join(__dirname,"./docs/openapi.yml")
);

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    service: "inventory-service",
    status: "UP",
    timestamp: new Date().toISOString()
  });
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
);

app.use(
  "/api/v1/inventory",
  inventoryRoutes
);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

async function startServer() {
  await connectRabbitMQ();
  await connectDatabase();
  await startInventoryConsumer();

  app.listen(PORT, () => {
    console.log(
      `Inventory service running on port ${PORT}`
    );
  });
}

startServer();