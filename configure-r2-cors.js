const fs = require("fs");
const path = require("path");
const { PutBucketCorsCommand, S3Client } = require("@aws-sdk/client-s3");

const envPath = path.join(__dirname, ".env.r2");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(envPath);

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET || "score-improve-cases";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing .env.r2 values: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [
            "https://score-improve-case.pages.dev",
            "http://127.0.0.1:8088",
            "http://localhost:8088",
          ],
          AllowedMethods: ["GET", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["Content-Length", "Content-Type", "ETag"],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  }));

  console.log(`Configured CORS for ${bucket}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
