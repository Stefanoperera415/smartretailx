const {
  ScanCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const { dynamoDB } = require("../config/database");

const TABLE_NAME = process.env.DYNAMODB_PRODUCTS_TABLE;

if (!TABLE_NAME) {
  throw new Error("DYNAMODB_PRODUCTS_TABLE is not defined");
}

// Get all products
async function findAll() {
  const result = await dynamoDB.send(
    new ScanCommand({
      TableName: TABLE_NAME,
    })
  );

  const products = result.Items || [];

  // Newest products first
  return products.sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

// Get product by productId
async function findById(productId) {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        productId,
      },
    })
  );

  return result.Item || null;
}

// Find product by name
// Case-insensitive exact match
async function findByName(name) {
  const result = await dynamoDB.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "#name = :name",
      ExpressionAttributeNames: {
        "#name": "name",
      },
      ExpressionAttributeValues: {
        ":name": name,
      },
    })
  );

  const products = result.Items || [];

  return (
    products.find(
      (product) =>
        typeof product.name === "string" &&
        product.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
}

// Create product
async function create(product) {
  const now = new Date().toISOString();

  const item = {
    ...product,
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || now,
  };

  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,

      // Prevent duplicate productId
      ConditionExpression:
        "attribute_not_exists(productId)",
    })
  );

  return item;
}

// Update product
async function update(productId, updates) {
  const allowedFields = [
    "name",
    "categoryId",
    "description",
    "price",
    "currency",
    "imageUrl",
    "status",
  ];

  const filteredUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }

  filteredUpdates.updatedAt = new Date().toISOString();

  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  let index = 0;

  for (const [field, value] of Object.entries(filteredUpdates)) {
    const nameKey = `#field${index}`;
    const valueKey = `:value${index}`;

    updateExpressions.push(
      `${nameKey} = ${valueKey}`
    );

    expressionAttributeNames[nameKey] = field;
    expressionAttributeValues[valueKey] = value;

    index++;
  }

  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: TABLE_NAME,

      Key: {
        productId,
      },

      UpdateExpression:
        `SET ${updateExpressions.join(", ")}`,

      ExpressionAttributeNames:
        expressionAttributeNames,

      ExpressionAttributeValues:
        expressionAttributeValues,

      ReturnValues: "ALL_NEW",

      // Don't create a new product if productId doesn't exist
      ConditionExpression:
        "attribute_exists(productId)",
    })
  );

  return result.Attributes || null;
}

// Delete product
async function remove(productId) {
  try {
    await dynamoDB.send(
      new DeleteCommand({
        TableName: TABLE_NAME,

        Key: {
          productId,
        },

        // Only delete if the product exists
        ConditionExpression:
          "attribute_exists(productId)",
      })
    );

    return true;
  } catch (error) {
    if (
      error.name ===
      "ConditionalCheckFailedException"
    ) {
      return false;
    }

    throw error;
  }
}

// Update only the imageUrl (S3 key)
async function updateImageUrl(productId, imageKey) {
  const result = await dynamoDB.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: "SET imageUrl = :url, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":url": imageKey,
        ":updatedAt": new Date().toISOString(),
      },
      ConditionExpression: "attribute_exists(productId)",
      ReturnValues: "ALL_NEW",
    })
  );
  return result.Attributes || null;
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  remove,
  updateImageUrl,
};