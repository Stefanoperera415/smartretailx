const {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  UpdateTableCommand,
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const NOTIFICATIONS_TABLE = process.env.DYNAMODB_NOTIFICATIONS_TABLE;
const PROCESSED_EVENTS_TABLE = process.env.DYNAMODB_PROCESSED_EVENTS_TABLE;

if (!NOTIFICATIONS_TABLE || !PROCESSED_EVENTS_TABLE) {
  throw new Error(
    "DYNAMODB_NOTIFICATIONS_TABLE and DYNAMODB_PROCESSED_EVENTS_TABLE must be defined",
  );
}

const client = new DynamoDBClient({ region: AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---------------------------------------------------------------------------
// Wait helpers
// ---------------------------------------------------------------------------

async function waitForTableActive(tableName, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const desc = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    if (desc.Table.TableStatus === "ACTIVE") return;
  }
  throw new Error(
    `Table ${tableName} did not become ACTIVE after ${maxAttempts} attempts`,
  );
}

async function waitForAllGsiActive(tableName, maxAttempts = 120) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const desc = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    const gsis = desc.Table.GlobalSecondaryIndexes || [];
    if (gsis.length === 0) return;
    const allActive = gsis.every((g) => g.IndexStatus === "ACTIVE");
    if (allActive) return;
  }
  console.warn(
    `Some GSIs on ${tableName} did not become ACTIVE within the wait window — continuing anyway.`,
  );
}

/**
 * Poll the table until no GSI is in CREATING or UPDATING state.
 * DynamoDB allows only ONE in-flight GSI operation per table at a time —
 * this is what causes the "Subscriber limit exceeded" error if we fire
 * off a second UpdateTable while the first is still running.
 */
async function waitForNoGsiInProgress(tableName, maxAttempts = 180) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const desc = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );

    if (desc.Table.TableStatus !== "ACTIVE") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const gsis = desc.Table.GlobalSecondaryIndexes || [];
    const busy = gsis.some(
      (g) => g.IndexStatus === "CREATING" || g.IndexStatus === "UPDATING",
    );

    if (!busy) return;

    if (attempt === 0) {
      const pending = gsis
        .filter((g) => g.IndexStatus !== "ACTIVE")
        .map((g) => `${g.IndexName} (${g.IndexStatus})`)
        .join(", ");
      console.log(
        `Waiting for in-flight GSI(s) on ${tableName} to finish: ${pending}`,
      );
    }

    await new Promise((r) => setTimeout(r, 10000)); // 10s between polls
  }

  console.warn(
    `GSI(s) on ${tableName} did not settle within the wait window — continuing.`,
  );
}

// ---------------------------------------------------------------------------
// Billing-mode detection
// ---------------------------------------------------------------------------

/**
 * Returns "PROVISIONED" or "PAY_PER_REQUEST".
 * Older tables created before BillingModeSummary existed default to PROVISIONED.
 */
async function getBillingMode(tableName) {
  const desc = await client.send(
    new DescribeTableCommand({ TableName: tableName }),
  );
  return desc.Table.BillingModeSummary?.BillingMode || "PROVISIONED";
}

// ---------------------------------------------------------------------------
// Table creation
// ---------------------------------------------------------------------------

async function ensureTable(
  tableName,
  keySchema,
  attributeDefinitions,
  globalSecondaryIndexes,
) {
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
      if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
        params.GlobalSecondaryIndexes = globalSecondaryIndexes;
      }
      await client.send(new CreateTableCommand(params));
      await waitForTableActive(tableName);
      if (globalSecondaryIndexes && globalSecondaryIndexes.length > 0) {
        await waitForAllGsiActive(tableName);
      }
      console.log(`Table ${tableName} created.`);
    } else {
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// GSI repair
// ---------------------------------------------------------------------------

/**
 * Add a single GSI, adapting to the table's billing mode.
 *
 * - PROVISIONED     → must include ProvisionedThroughput (we use 5/5).
 * - PAY_PER_REQUEST → must NOT include ProvisionedThroughput.
 *
 * Also carries a fallback for the AWS quirk where an on-demand table
 * sometimes demands ProvisionedThroughput anyway.
 */
async function addOneGsi(tableName, gsi, billingMode) {
  const baseCreate = {
    IndexName: gsi.IndexName,
    KeySchema: gsi.KeySchema,
    Projection: gsi.Projection,
  };

  const tryWith = async (includeThroughput) => {
    const create = includeThroughput
      ? {
          ...baseCreate,
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        }
      : { ...baseCreate };

    return client.send(
      new UpdateTableCommand({
        TableName: tableName,
        AttributeDefinitions: gsi.AttributeDefinitions,
        GlobalSecondaryIndexUpdates: [{ Create: create }],
      }),
    );
  };

  const wantsThroughput = billingMode === "PROVISIONED";
  console.log(
    `Adding GSI ${gsi.IndexName} to ${tableName} ` +
      `(table billing mode: ${billingMode}, ` +
      `provisioned throughput: ${wantsThroughput ? "included" : "omitted"})...`,
  );

  try {
    await tryWith(wantsThroughput);
  } catch (err) {
    const needsThroughput =
      /ReadCapacityUnits|WriteCapacityUnits|ProvisionedThroughput/i.test(
        err.message,
      );

    // AWS quirk: on-demand table but API still wants capacity. Retry with PT.
    if (!wantsThroughput && needsThroughput) {
      console.warn(
        `DynamoDB asked for ProvisionedThroughput on an on-demand table. ` +
          `Retrying ${gsi.IndexName} with a fallback value...`,
      );
      await tryWith(true);
    } else {
      throw err;
    }
  }

  await waitForAllGsiActive(tableName);
  console.log(`GSI ${gsi.IndexName} added.`);
}

async function repairGlobalSecondaryIndexes(tableName, desiredGsis) {
  if (!desiredGsis || desiredGsis.length === 0) return;

  // Step 1 — wait for any GSI that's currently CREATING/UPDATING to settle.
  await waitForNoGsiInProgress(tableName);

  // Step 2 — figure out which desired GSIs are missing.
  const desc = await client.send(
    new DescribeTableCommand({ TableName: tableName }),
  );
  const existingNames = new Set(
    (desc.Table.GlobalSecondaryIndexes || []).map((g) => g.IndexName),
  );

  const missing = desiredGsis.filter((g) => !existingNames.has(g.IndexName));

  if (missing.length === 0) {
    console.log(`All GSIs on ${tableName} are present.`);
    return;
  }

  const billingMode =
    desc.Table.BillingModeSummary?.BillingMode || "PROVISIONED";

  console.log(
    `Table ${tableName} is missing GSIs: ${missing
      .map((g) => g.IndexName)
      .join(", ")} — adding them now (this can take a few minutes).`,
  );

  // Step 3 — add each missing GSI one at a time, retrying on the
  // "Only 1 online index" error.
  for (const gsi of missing) {
    // Re-check the table each iteration: a previous add (or another
    // running instance) may have shifted state.
    const current = await client.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    const alreadyThere = (current.Table.GlobalSecondaryIndexes || []).some(
      (g) => g.IndexName === gsi.IndexName,
    );
    if (alreadyThere) {
      console.log(`GSI ${gsi.IndexName} already present on ${tableName}.`);
      await waitForNoGsiInProgress(tableName);
      continue;
    }

    let attempt = 0;
    const maxAttempts = 5;
    let added = false;

    while (!added && attempt < maxAttempts) {
      attempt++;
      try {
        await addOneGsi(tableName, gsi, billingMode);
        added = true;
      } catch (err) {
        const isConcurrentLimit =
          /Subscriber limit exceeded|Only 1 online index/i.test(err.message);

        if (isConcurrentLimit && attempt < maxAttempts) {
          console.warn(
            `GSI ${gsi.IndexName} blocked by another in-flight index ` +
              `(attempt ${attempt}/${maxAttempts}). Waiting for it to finish...`,
          );
          await waitForNoGsiInProgress(tableName);
          // loop retries
        } else {
          console.warn(
            `Could not add GSI ${gsi.IndexName} to ${tableName}: ${err.message}`,
          );
          // Don't throw — the next startup will retry.
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public connect
// ---------------------------------------------------------------------------

async function connectDatabase() {
  try {
    // ---- Notifications table + GSIs ----
    const notificationsKeySchema = [
      { AttributeName: "notificationId", KeyType: "HASH" },
    ];

    const notificationsAttrs = [
      { AttributeName: "notificationId", AttributeType: "S" },
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "status", AttributeType: "S" },
    ];

    const notificationsGsis = [
      {
        IndexName: "customerId-index",
        KeySchema: [
          { AttributeName: "customerId", KeyType: "HASH" },
          { AttributeName: "createdAt", KeyType: "RANGE" }, // ✅ add sort key
        ],
        Projection: { ProjectionType: "ALL" },
        AttributeDefinitions: [
          { AttributeName: "customerId", AttributeType: "S" },
          { AttributeName: "createdAt", AttributeType: "S" },
        ],
      },
    ];

    // For CreateTable we strip the per-GSI AttributeDefinitions — the top-level
    // AttributeDefinitions already declares every attribute the table uses.
    const gsisForCreate = notificationsGsis.map(
      ({ AttributeDefinitions, ...gsi }) => gsi,
    );

    await ensureTable(
      NOTIFICATIONS_TABLE,
      notificationsKeySchema,
      notificationsAttrs,
      gsisForCreate,
    );

    await repairGlobalSecondaryIndexes(NOTIFICATIONS_TABLE, notificationsGsis);

    // ---- Processed events table (no GSIs) ----
    await ensureTable(
      PROCESSED_EVENTS_TABLE,
      [{ AttributeName: "eventId", KeyType: "HASH" }],
      [{ AttributeName: "eventId", AttributeType: "S" }],
    );

    console.log("Connected to DynamoDB");
    console.log("Notifications table:", NOTIFICATIONS_TABLE);
    console.log("Processed events table:", PROCESSED_EVENTS_TABLE);
  } catch (error) {
    console.error("DynamoDB connection failed:", error);
    process.exit(1);
  }
}

module.exports = {
  dynamoDB,
  connectDatabase,
  NOTIFICATIONS_TABLE,
  PROCESSED_EVENTS_TABLE,
};
