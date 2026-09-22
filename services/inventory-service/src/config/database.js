const { DynamoDBClient, DescribeTableCommand, CreateTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const INVENTORY_TABLE = process.env.DYNAMODB_INVENTORY_TABLE;
const PROCESSED_EVENTS_TABLE = process.env.DYNAMODB_PROCESSED_EVENTS_TABLE;
const WAREHOUSE_TABLE = process.env.DYNAMODB_WAREHOUSE_TABLE || "smartretailx-warehouse"; // ✅ default

if (!INVENTORY_TABLE || !PROCESSED_EVENTS_TABLE) {
  throw new Error("DYNAMODB_INVENTORY_TABLE and DYNAMODB_PROCESSED_EVENTS_TABLE must be defined");
}

const client = new DynamoDBClient({ region: AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function ensureTable(tableName, keySchema, attributeDefinitions, billingMode = "PAY_PER_REQUEST") {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table ${tableName} already exists.`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(`Creating table ${tableName}...`);
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          KeySchema: keySchema,
          AttributeDefinitions: attributeDefinitions,
          BillingMode: billingMode,
        })
      );
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
    // Inventory table
    await ensureTable(INVENTORY_TABLE,
      [
        { AttributeName: "productId", KeyType: "HASH" },
        { AttributeName: "warehouseId", KeyType: "RANGE" },
      ],
      [
        { AttributeName: "productId", AttributeType: "S" },
        { AttributeName: "warehouseId", AttributeType: "S" },
      ]
    );

    // Processed events table
    await ensureTable(PROCESSED_EVENTS_TABLE,
      [{ AttributeName: "eventId", KeyType: "HASH" }],
      [{ AttributeName: "eventId", AttributeType: "S" }]
    );

    // ✅ Warehouse table – will be created if missing
    await ensureTable(WAREHOUSE_TABLE,
      [{ AttributeName: "warehouseId", KeyType: "HASH" }],
      [{ AttributeName: "warehouseId", AttributeType: "S" }]
    );

    console.log("Connected to DynamoDB");
    console.log("Inventory table:", INVENTORY_TABLE);
    console.log("Processed events table:", PROCESSED_EVENTS_TABLE);
    console.log("Warehouse table:", WAREHOUSE_TABLE);
  } catch (error) {
    console.error("DynamoDB connection failed:", error);
    process.exit(1);
  }
}

module.exports = {
  dynamoDB,
  connectDatabase,
  INVENTORY_TABLE,
  PROCESSED_EVENTS_TABLE,
  WAREHOUSE_TABLE, // ✅ export so other files can use it
};