require("dotenv").config();

const { SQSClient } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const NOTIFICATION_QUEUE_URL = process.env.NOTIFICATION_QUEUE_URL;
if (!NOTIFICATION_QUEUE_URL) {
  throw new Error("NOTIFICATION_QUEUE_URL is not defined");
}

module.exports = { sqs, NOTIFICATION_QUEUE_URL };