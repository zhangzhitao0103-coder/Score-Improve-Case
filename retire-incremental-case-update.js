const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = __dirname;
const targetRoot = path.resolve(process.env.CASE_TARGET_ROOT || path.join(repoRoot, "Score-improve-cases-main", "提分案例汇总"));
const classifiedPath = path.resolve(process.env.OLD_CLASSIFIED_MANIFEST || path.join(repoRoot, "outputs", "incremental-case-updates", "classified-new-images-latest.json"));
const r2ManifestPath = path.resolve(process.env.OLD_R2_MANIFEST || path.join(repoRoot, "outputs", "r2-assets", "upload-manifest-incremental.json"));
const dataPath = path.join(repoRoot, "data.js");
const quarantineRoot = path.resolve(process.env.CASE_QUARANTINE_ROOT || path.join(repoRoot, "outputs", "retired-case-images"));
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "https://pub-d82b16008394428c95e42b68dcde148f.r2.dev").replace(/\/$/, "");

function hashKey(webPath) {
  return crypto.createHash("sha1").update(webPath).digest("hex").slice(0, 16);
}

function originalKeyFor(filePath) {
  const relative = path.relative(targetRoot, filePath).split(path.sep);
  const webPath = ["提分案例汇总", ...relative].map(encodeURIComponent).join("/");
  const ext = path.extname(filePath).toLowerCase();
  return `originals/${hashKey(webPath)}${ext === ".jpeg" ? ".jpg" : ext}`;
}

function readData() {
  const text = fs.readFileSync(dataPath, "utf8");
  return JSON.parse(text.replace(/^window\.CASE_DATA = /, "").replace(/;\s*$/, ""));
}

function writeData(data) {
  fs.writeFileSync(dataPath, `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function main() {
  if (!fs.existsSync(classifiedPath)) throw new Error(`Missing old classified manifest: ${classifiedPath}`);
  if (!fs.existsSync(targetRoot)) throw new Error(`Missing target root: ${targetRoot}`);

  const classified = JSON.parse(fs.readFileSync(classifiedPath, "utf8"));
  const copied = classified.copied || [];
  if (!copied.length) throw new Error("Old classified manifest contains no copied images.");

  const oldFiles = copied.map((item) => path.resolve(item.destPath));
  const missing = oldFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) throw new Error(`Old images missing before quarantine: ${missing.slice(0, 5).join(" | ")}`);
  if (oldFiles.some((filePath) => !isWithin(targetRoot, filePath))) {
    throw new Error("Refusing to quarantine a path outside the target case root.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const quarantineDir = path.join(quarantineRoot, stamp);
  const moved = [];
  for (const item of copied) {
    const sourcePath = path.resolve(item.destPath);
    const relative = path.relative(targetRoot, sourcePath);
    const destination = path.join(quarantineDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(sourcePath, destination);
    moved.push({ sourcePath, quarantinePath: destination, relative });
  }

  const oldOriginalUrls = new Set(moved.map((item) => `${publicBaseUrl}/${originalKeyFor(item.sourcePath)}`));
  const data = readData();
  let removed = 0;
  for (const teacher of data.teachers || []) {
    for (const band of teacher.scoreBands || []) {
      const before = band.cases.length;
      band.cases = band.cases.filter((item) => !oldOriginalUrls.has(item.imageUrl));
      removed += before - band.cases.length;
    }
  }
  data.generatedAt = new Date().toISOString();
  writeData(data);

  const oldR2 = fs.existsSync(r2ManifestPath) ? JSON.parse(fs.readFileSync(r2ManifestPath, "utf8")) : [];
  const oldObjects = oldR2.flatMap((item) => [item.originalKey, item.thumbKey, item.previewKey]).filter(Boolean);
  const report = {
    generatedAt: new Date().toISOString(),
    oldClassifiedManifest: classifiedPath,
    oldR2Manifest: r2ManifestPath,
    quarantineDir,
    oldCopiedCount: copied.length,
    movedCount: moved.length,
    removedDataCount: removed,
    oldObjectCount: oldObjects.length,
    moved,
    oldObjects,
  };
  const reportDir = path.join(repoRoot, "outputs", "incremental-case-updates");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "retired-old-update-latest.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ quarantineDir, movedCount: moved.length, removedDataCount: removed, oldObjectCount: oldObjects.length }, null, 2));
}

main();
