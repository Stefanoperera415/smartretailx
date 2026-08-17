const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { connectRabbitMQ } = require("./config/rabbitmq");
const { startNotificationConsumer } = require("./events/notificationConsumer");

const swaggerUi =
  require("swagger-ui-express");

const YAML =
  require("yamljs");

const connectDatabase =
  require("./config/database");

const notificationRoutes =
  require("./routes/notifications");

const app = express();

const PORT =
  process.env.PORT || 3006;

const swaggerDocument =
  YAML.load(
    "./src/docs/openapi.yml"
  );

app.use(cors());
app.use(express.json());

app.get(
  "/health",
  (req, res) => {
    res.status(200).json({
      service:
        "notification-service",

      status: "UP",

      timestamp:
        new Date().toISOString()
    });
  }
);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(
    swaggerDocument
  )
);

app.use(
  "/api/v1/notifications",
  notificationRoutes
);

app.use(
  (req, res) => {
    res.status(404).json({
      error: "Route not found"
    });
  }
);

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      error:
        "Internal server error"
    });
  }
);

async function startServer() {
  await connectDatabase();
  await connectRabbitMQ();
  await startNotificationConsumer();

  app.listen(
    PORT,
    () => {
      console.log(
        `Notification service running on port ${PORT}`
      );
    }
  );
}

startServer();