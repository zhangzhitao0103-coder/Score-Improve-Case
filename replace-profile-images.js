const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const sourceRoot = path.join(__dirname, "调整", "调整");
const caseRoot = path.join(__dirname, "Score-improve-cases-main", "提分案例汇总");
const outputDir = path.join(__dirname, "outputs", "profile-image-replacements");
const r2OutputDir = path.join(__dirname, "outputs", "r2-assets");
const replacementManifestPath = path.join(outputDir, "profile-replacements-latest.json");
const r2ManifestPath = path.join(r2OutputDir, "upload-manifest-profile-replacements.json");
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "https://pub-d82b16008394428c95e42b68dcde148f.r2.dev").replace(/\/$/, "");

const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
const contentTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function isImage(fileName) {
  return imageExts.has(path.extname(fileName).toLowerCase());
}

function parseTeacher(folderName) {
  const clean = folderName.replace(/-提分案例$/, "").trim();
  const subject = subjects.find((item) => clean.startsWith(item)) || "";
  return {
    subject,
    name: subject ? clean.slice(subject.length).trim() : clean,
  };
}

function targetBaseName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  if (base.startsWith("优秀学员版-")) return "优秀学员";
  if (base.startsWith("主理人+提分截图-优化版")) return "提分案例";
  if (base.startsWith("主理人背书-")) return "背书";
  if (base.startsWith("主理人大招-")) return "大招";
  return "";
}

function findTargetImage(teacherDir, baseName) {
  const matches = fs.readdirSync(teacherDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImage(entry.name) && path.basename(entry.name, path.extname(entry.name)) === baseName)
    .map((entry) => path.join(teacherDir, entry.name));
  return matches[0] || null;
}

function hashKey(webPath) {
  return crypto.createHash("sha1").update(webPath).digest("hex").slice(0, 16);
}

function toWebPath(filePath) {
  return ["提分案例汇总", ...path.relative(caseRoot, filePath).split(path.sep)]
    .map(encodeURIComponent)
    .join("/");
}

function assetInfo(fullPath) {
  const webPath = toWebPath(fullPath);
  const sourceFolder = path.relative(caseRoot, fullPath).split(path.sep)[0] || "";
  const ext = path.extname(fullPath).toLowerCase();
  const hash = hashKey(webPath);
  const originalKey = `originals/${hash}${ext === ".jpeg" ? ".jpg" : ext}`;
  const thumbKey = `thumbs/${hash}.webp`;
  const previewKey = `previews/${hash}.webp`;

  return {
    localPath: fullPath,
    sourceFolder,
    originalKey,
    thumbKey,
    previewKey,
    thumbPath: path.join(r2OutputDir, thumbKey),
    previewPath: path.join(r2OutputDir, previewKey),
    contentType: contentTypes.get(ext) || "application/octet-stream",
  };
}

async function copyOrConvert(sourcePath, targetPath) {
  const targetExt = path.extname(targetPath).toLowerCase();
  const sourceExt = path.extname(sourcePath).toLowerCase();
  if (targetExt === sourceExt) {
    fs.copyFileSync(sourcePath, targetPath);
    return "copied";
  }

  let pipeline = sharp(sourcePath, { failOn: "none" }).rotate();
  if (targetExt === ".png") pipeline = pipeline.png();
  else if (targetExt === ".jpg" || targetExt === ".jpeg") pipeline = pipeline.jpeg({ quality: 92 });
  else if (targetExt === ".webp") pipeline = pipeline.webp({ quality: 90 });
  else throw new Error(`Unsupported target extension: ${targetExt}`);
  await pipeline.toFile(targetPath);
  return "converted";
}

async function writeWebp(inputPath, outputPath, width, quality) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(outputPath);
}

function readData() {
  const text = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
  return JSON.parse(text.replace(/^window\.CASE_DATA = /, "").replace(/;\s*$/, ""));
}

function writeData(data) {
  fs.writeFileSync(
    path.join(__dirname, "data.js"),
    `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`,
    "utf8"
  );
}

async function main() {
  if (!fs.existsSync(sourceRoot)) throw new Error(`Missing source folder: ${sourceRoot}`);
  if (!fs.existsSync(caseRoot)) throw new Error(`Missing case root: ${caseRoot}`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(r2OutputDir, { recursive: true });

  const targetTeachers = new Map();
  for (const entry of fs.readdirSync(caseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = parseTeacher(entry.name);
    targetTeachers.set(parsed.name, {
      ...parsed,
      folderName: entry.name,
      fullPath: path.join(caseRoot, entry.name),
    });
  }

  const replacements = [];
  const unmatched = [];
  const skipped = [];

  for (const sourceTeacherEntry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!sourceTeacherEntry.isDirectory()) continue;
    const sourceTeacherName = sourceTeacherEntry.name.trim();
    const targetTeacher = targetTeachers.get(sourceTeacherName);
    const sourceTeacherPath = path.join(sourceRoot, sourceTeacherEntry.name);
    const sourceFiles = fs.readdirSync(sourceTeacherPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isImage(entry.name));

    if (!targetTeacher) {
      unmatched.push({
        teacher: sourceTeacherName,
        imageCount: sourceFiles.length,
        files: sourceFiles.map((entry) => entry.name),
      });
      continue;
    }

    for (const sourceFile of sourceFiles) {
      const category = targetBaseName(sourceFile.name);
      const sourcePath = path.join(sourceTeacherPath, sourceFile.name);
      if (!category) {
        skipped.push({ teacher: sourceTeacherName, file: sourceFile.name, reason: "Unknown naming pattern" });
        continue;
      }

      const targetPath = findTargetImage(targetTeacher.fullPath, category);
      if (!targetPath) {
        skipped.push({ teacher: sourceTeacherName, file: sourceFile.name, category, reason: "Target image not found" });
        continue;
      }

      const mode = await copyOrConvert(sourcePath, targetPath);
      const asset = assetInfo(targetPath);
      await writeWebp(targetPath, asset.thumbPath, 560, 68);
      await writeWebp(targetPath, asset.previewPath, 1600, 78);

      replacements.push({
        teacher: sourceTeacherName,
        targetTeacherFolder: targetTeacher.folderName,
        category,
        sourcePath,
        targetPath,
        targetRelativeToCaseRoot: path.relative(caseRoot, targetPath),
        mode,
        ...asset,
      });
    }
  }

  const data = readData();
  data.generatedAt = new Date().toISOString();
  writeData(data);

  fs.writeFileSync(replacementManifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceRoot,
    caseRoot,
    replacementCount: replacements.length,
    unmatchedCount: unmatched.length,
    skippedCount: skipped.length,
    replacements,
    unmatched,
    skipped,
  }, null, 2), "utf8");

  fs.writeFileSync(r2ManifestPath, JSON.stringify(replacements.map((item) => ({
    localPath: item.localPath,
    sourceFolder: item.sourceFolder,
    originalKey: item.originalKey,
    thumbKey: item.thumbKey,
    previewKey: item.previewKey,
    thumbPath: item.thumbPath,
    previewPath: item.previewPath,
    contentType: item.contentType,
  })), null, 2), "utf8");

  console.log(JSON.stringify({
    replacementCount: replacements.length,
    unmatchedCount: unmatched.length,
    skippedCount: skipped.length,
    replacementManifestPath,
    r2ManifestPath,
    uploadObjects: replacements.length * 3,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
