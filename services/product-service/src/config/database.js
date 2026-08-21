const {
  DynamoDBClient,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
} = require("@aws-sdk/lib-dynamodb");

const AWS_REGION =
  process.env.AWS_REGION || "ap-south-1";

const TABLE_NAME =
  process.env.DYNAMODB_PRODUCTS_TABLE;

if (!TABLE_NAME) {
  throw new Error(
    "DYNAMODB_PRODUCTS_TABLE is not defined in .env"
  );
}

// Create DynamoDB client
const client = new DynamoDBClient({
  region: AWS_REGION,
});

// Create DynamoDB Document Client
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Verify DynamoDB and Products table
async function connectDatabase() {
  try {
    const result = await client.send(
      new DescribeTableCommand({
        TableName: TABLE_NAME,
      })
    );

    console.log("========================================");
    console.log("Connected to DynamoDB");
    console.log("Region:", AWS_REGION);
    console.log("Products table:", TABLE_NAME);
    console.log(
      "Table status:",
      result.Table.TableStatus
    );
    console.log(
      "Partition key:",
      result.Table.KeySchema[0].AttributeName
    );
    console.log("========================================");
  } catch (error) {
    console.error(
      "DynamoDB connection failed:"
    );
    console.error(error);

    process.exit(1);
  }
}

module.exports = {
  dynamoDB,
  connectDatabase,
};