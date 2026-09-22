require("dotenv").config({ path: "../.env.tests" });
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const fs = require("fs");
const path = require("path");

const {
  COGNITO_REGION,
  COGNITO_CLIENT_ID,
  COGNITO_USERNAME,
  COGNITO_PASSWORD,
} = process.env;

if (!COGNITO_CLIENT_ID || !COGNITO_USERNAME || !COGNITO_PASSWORD) {
  console.error("Missing COGNITO_CLIENT_ID / COGNITO_USERNAME / COGNITO_PASSWORD in .env.tests");
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: COGNITO_REGION || "ap-south-1" });

async function main() {
  console.log(`Authenticating ${COGNITO_USERNAME} against ${COGNITO_CLIENT_ID}...`);

  const res = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: COGNITO_USERNAME,
        PASSWORD: COGNITO_PASSWORD,
      },
    })
  );

  const idToken = res.AuthenticationResult?.IdToken;
  if (!idToken) {
    console.error("No IdToken returned. Check that ALLOW_USER_PASSWORD_AUTH is enabled.");
    process.exit(1);
  }

  // Overwrite AUTH_TOKEN in .env.tests
  const envPath = path.join(__dirname, "..", ".env.tests");
  let envText = fs.readFileSync(envPath, "utf8");

  if (/^AUTH_TOKEN=.*/m.test(envText)) {
    envText = envText.replace(/^AUTH_TOKEN=.*/m, `AUTH_TOKEN=${idToken}`);
  } else {
    envText += `\nAUTH_TOKEN=${idToken}\n`;
  }

  fs.writeFileSync(envPath, envText);
  console.log(`✅ Fresh token saved to .env.tests (length ${idToken.length})`);
  console.log(`   Expires in ~1 hour. Re-run \`npm run token\` after that.`);
}

main().catch((err) => {
  console.error("Token fetch failed:", err.name, "-", err.message);
  process.exit(1);
});