const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/s3");

const BUCKET_NAME = process.env.S3_PRODUCT_IMAGES_BUCKET;
if (!BUCKET_NAME) throw new Error("S3_PRODUCT_IMAGES_BUCKET is not defined");

/**
 * Upload a file to S3
 */
async function uploadFile(fileBuffer, key, contentType) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  });
  await s3.send(command);
  return key;
}

/**
 * Generate a pre‑signed URL – our wrapper around the SDK's getSignedUrl
 */
async function generateSignedUrl(key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete an object from S3
 */
async function deleteFile(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  await s3.send(command);
}

module.exports = {
  uploadFile,
  generateSignedUrl,   // ✅ renamed to avoid conflict
  deleteFile,
};