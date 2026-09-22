const {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand, // ✅ added for table creation
} = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
} = require("@aws-sdk/lib-dynamodb");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

const TABLE_NAME = process.env.DYNAMODB_PRODUCTS_TABLE;
const CATEGORY_TABLE = process.env.DYNAMODB_CATEGORY_TABLE; // ✅ new

if (!TABLE_NAME) {
  throw new Error("DYNAMODB_PRODUCTS_TABLE is not defined in .env");
}
if (!CATEGORY_TABLE) {
  throw new Error("DYNAMODB_CATEGORY_TABLE is not defined in .env");
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
    // Verify Products table (already exists)
    await client.send(
      new DescribeTableCommand({
        TableName: TABLE_NAME,
      })
    );
    console.log(`Products table ${TABLE_NAME} verified.`);

    // ✅ Create Categories table if missing
    await ensureTable(
      CATEGORY_TABLE,
      [{ AttributeName: "categoryId", KeyType: "HASH" }],
      [{ AttributeName: "categoryId", AttributeType: "S" }]
    );

    console.log("========================================");
    console.log("Connected to DynamoDB");
    console.log("Region:", AWS_REGION);
    console.log("Products table:", TABLE_NAME);
    console.log("Categories table:", CATEGORY_TABLE);
    console.log("========================================");
  } catch (error) {
    console.error("DynamoDB connection failed:", error);
    process.exit(1);
  }
}

module.exports = {
  dynamoDB,
  connectDatabase,
};