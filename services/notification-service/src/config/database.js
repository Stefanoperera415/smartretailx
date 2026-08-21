const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const NOTIFICATIONS_TABLE = process.env.DYNAMODB_NOTIFICATIONS_TABLE;
const PROCESSED_EVENTS_TABLE = process.env.DYNAMODB_PROCESSED_EVENTS_TABLE;

if (!NOTIFICATIONS_TABLE || !PROCESSED_EVENTS_TABLE) {
  throw new Error("DYNAMODB_NOTIFICATIONS_TABLE and DYNAMODB_PROCESSED_EVENTS_TABLE must be defined");
}

const client = new DynamoDBClient({ region: AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function ensureTable(tableName, keySchema, attributeDefinitions, globalSecondaryIndexes) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table ${tableName} already exists.`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(`Creating table ${tableName}...`);
      const params = {
        TableName: tableName,
        KeySchema: keySchema,
        AttributeDefinitions: attributeDefinitions,
        BillingMode: "PAY_PER_REQUEST",
      };
      // Only add GlobalSecondaryIndexes if defined and not empty
      if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
        params.GlobalSecondaryIndexes = globalSecondaryIndexes;
      }
      await client.send(new CreateTableCommand(params));
      // Wait for table to become active
      let tableActive = false;
      while (!tableActive) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const desc = await client.send(new DescribeTableCommand({ TableName: tableName }));
        tableActive = desc.Table.TableStatus === "ACTIVE";
      }
      console.log(`Table ${tableName} created.`);
    } else {
      throw error;
    }
  }
}

async function connectDatabase() {
  try {
    // Notifications table with GSIs
    await ensureTable(
      NOTIFICATIONS_TABLE,
      [{ AttributeName: "notificationId", KeyType: "HASH" }],
      [
        { AttributeName: "notificationId", AttributeType: "S" },
        { AttributeName: "customerId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
      ],
      [
        {
          IndexName: "customerId-index",
          KeySchema: [{ AttributeName: "customerId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "status-index",
          KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ]
    );

    // Processed events table – no GSIs
    await ensureTable(
      PROCESSED_EVENTS_TABLE,
      [{ AttributeName: "eventId", KeyType: "HASH" }],
      [{ AttributeName: "eventId", AttributeType: "S" }]
      // No 4th argument = no GSIs
    );

    console.log("Connected to DynamoDB");
    console.log("Notifications table:", NOTIFICATIONS_TABLE);
    console.log("Processed events table:", PROCESSED_EVENTS_TABLE);
  } catch (error) {
    console.error("DynamoDB connection failed:", error);
    process.exit(1);
  }
}

module.exports = { dynamoDB, connectDatabase, NOTIFICATIONS_TABLE, PROCESSED_EVENTS_TABLE };