const fs = require("fs");
const path = require("path");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const envPath = path.join(__dirname, ".env.r2");
const manifestPath = path.join(__dirname, "outputs", "r2-assets", "upload-manifest.json");
const statePath = path.join(__dirname, "outputs", "r2-assets", "upload-state.json");

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

function contentTypeFor(filePath, fallback = "application/octet-stream") {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return fallback;
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current, index);
    }
  });
  await Promise.all(runners);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(action, label, retries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const retryable = ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(error.code) ||
        error.name === "TimeoutError";
      if (!retryable || attempt === retries) break;
      const delay = 1200 * attempt;
      console.warn(`Retrying ${label} after ${error.code || error.name || "error"} (${attempt}/${retries})`);
      await wait(delay);
    }
  }
  throw lastError;
}

function readState() {
  if (!fs.existsSync(statePath)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(statePath, "utf8")).uploaded || []);
}

function writeState(uploaded) {
  fs.writeFileSync(statePath, JSON.stringify({ uploaded: [...uploaded].sort() }, null, 2), "utf8");
}

async function main() {
  loadEnvFile(envPath);

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET || "score-improve-cases";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const concurrency = Number(process.env.R2_UPLOAD_CONCURRENCY || 3);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing .env.r2 values: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Missing upload manifest. Run npm run build:r2-assets first.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const uploadItems = manifest.flatMap((asset) => [
    {
      key: asset.thumbKey,
      filePath: asset.thumbPath,
      contentType: "image/webp",
    },
    {
      key: asset.previewKey,
      filePath: asset.previewPath,
      contentType: "image/webp",
    },
    {
      key: asset.originalKey,
      filePath: asset.localPath,
      contentType: contentTypeFor(asset.localPath, asset.contentType),
    },
  ]);
  const uploaded = readState();
  const remaining = uploadItems.filter((item) => !uploaded.has(item.key));

  console.log(`Uploading ${remaining.length}/${uploadItems.length} objects to ${bucket}...`);
  await mapLimit(remaining, concurrency, async (item, currentIndex) => {
    await withRetry(() => client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: item.key,
      Body: fs.createReadStream(item.filePath),
      ContentType: item.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })), item.key);
    uploaded.add(item.key);
    if (currentIndex % 50 === 0 || currentIndex === remaining.length) {
      writeState(uploaded);
      console.log(`Uploaded ${currentIndex}/${remaining.length}`);
    }
  });

  writeState(uploaded);
  console.log("Upload complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
