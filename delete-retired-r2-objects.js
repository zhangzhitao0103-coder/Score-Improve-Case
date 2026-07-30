const fs = require("fs");
const path = require("path");
const { DeleteObjectsCommand, S3Client } = require("@aws-sdk/client-s3");

const repoRoot = __dirname;
const envPath = path.join(repoRoot, ".env.r2");
const reportPath = path.resolve(process.env.RETIRED_R2_REPORT || path.join(repoRoot, "outputs", "incremental-case-updates", "retired-old-update-latest.json"));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function readReferencedKeys() {
  const text = fs.readFileSync(path.join(repoRoot, "data.js"), "utf8");
  const keys = new Set();
  for (const match of text.matchAll(/https:\/\/[^/]+\/(?:originals|thumbs|previews)\/([^"']+)/g)) {
    const full = match[0];
    keys.add(full.slice(full.indexOf("/", 8) + 1));
  }
  return keys;
}

async function main() {
  loadEnvFile(envPath);
  if (!fs.existsSync(reportPath)) throw new Error(`Missing retired R2 report: ${reportPath}`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const referenced = readReferencedKeys();
  const candidates = [...new Set(report.oldObjects || [])];
  const deletable = candidates.filter((key) => !referenced.has(key));
  const retained = candidates.filter((key) => referenced.has(key));

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET || "score-improve-cases";
  if (!accountId || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing .env.r2 values for R2 deletion.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });

  for (let index = 0; index < deletable.length; index += 1000) {
    const batch = deletable.slice(index, index + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
    console.log(`Deleted ${Math.min(index + batch.length, deletable.length)}/${deletable.length}`);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    bucket,
    oldObjectCount: candidates.length,
    deletedObjectCount: deletable.length,
    retainedReferencedObjectCount: retained.length,
    deletedObjects: deletable,
    retainedObjects: retained,
  };
  fs.writeFileSync(path.join(repoRoot, "outputs", "incremental-case-updates", "r2-retirement-result-latest.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ oldObjectCount: candidates.length, deletedObjectCount: deletable.length, retainedReferencedObjectCount: retained.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
