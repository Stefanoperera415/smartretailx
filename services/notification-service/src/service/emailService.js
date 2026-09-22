require("dotenv").config();

const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

const USE_SES = process.env.USE_SES === "true";
const FROM_ADDRESS = process.env.SES_FROM_ADDRESS;
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

let ses = null;
if (USE_SES && FROM_ADDRESS) {
  ses = new SESv2Client({ region: AWS_REGION });
  console.log(`SES enabled – sending from ${FROM_ADDRESS}`);
} else {
  console.log("SES disabled – email delivery will be mocked");
}

/**
 * Send an email via SES (or mock it if SES is disabled).
 * Returns { success, messageId?, reason?, mocked? }
 * Never throws.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!USE_SES || !FROM_ADDRESS) {
    console.log(`[MOCK EMAIL] to=${to} subject="${subject}"`);
    console.log(`[MOCK EMAIL] body: ${text}`);
    return { success: true, messageId: `MOCK-${Date.now()}`, mocked: true };
  }

  try {
    const command = new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: text, Charset: "UTF-8" },
            ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
          },
        },
      },
    });

    const res = await ses.send(command);
    console.log(`SES email sent to ${to}: ${res.MessageId}`);
    return { success: true, messageId: res.MessageId };
  } catch (err) {
    console.error(`SES send failed to ${to}:`, err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = { sendEmail };