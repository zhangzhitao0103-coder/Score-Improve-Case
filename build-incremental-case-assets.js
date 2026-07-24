const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const caseRoot = path.join(__dirname, "Score-improve-cases-main", "提分案例汇总");
const classifiedManifestPath = process.env.CLASSIFIED_CASE_MANIFEST ||
  path.join(__dirname, "outputs", "incremental-case-updates", "classified-new-images-latest.json");
const outputDir = path.join(__dirname, "outputs", "r2-assets");
const incrementalManifestPath = path.join(outputDir, "upload-manifest-incremental.json");
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "https://pub-d82b16008394428c95e42b68dcde148f.r2.dev").replace(/\/$/, "");

const provinces = [
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江",
  "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆",
  "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆"
];
const contentTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

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
    webPath,
    sourceFolder,
    originalKey,
    thumbKey,
    previewKey,
    thumbUrl: `${publicBaseUrl}/${thumbKey}`,
    previewUrl: `${publicBaseUrl}/${previewKey}`,
    imageUrl: `${publicBaseUrl}/${originalKey}`,
    thumbPath: path.join(outputDir, thumbKey),
    previewPath: path.join(outputDir, previewKey),
    contentType: contentTypes.get(ext) || "application/octet-stream",
  };
}

function normalizeProvince(token) {
  if (provinces.includes(token)) return token;

  const suffixNormalized = token
    .replace(/省$/, "")
    .replace(/市$/, "")
    .replace(/壮族自治区$/, "")
    .replace(/回族自治区$/, "")
    .replace(/维吾尔自治区$/, "")
    .replace(/自治区$/, "");

  return provinces.includes(suffixNormalized) ? suffixNormalized : "";
}

function parseCaseName(fileName, teacherName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  let text = baseName.replace(new RegExp(`^${teacherName}_?`), "");
  let province = "";

  const firstToken = text.split("_").find(Boolean) || "";
  const normalizedProvince = normalizeProvince(firstToken);
  if (normalizedProvince) {
    province = normalizedProvince;
    text = text.slice(text.indexOf(firstToken) + firstToken.length).replace(/^_+/, "");
  }

  return {
    province,
    scoreText: text || baseName,
  };
}

function cleanScoreBand(folderName) {
  return folderName.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").trim();
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

async function writeWebp(inputPath, outputPath, width, quality) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(outputPath);
}

async function main() {
  if (!fs.existsSync(classifiedManifestPath)) {
    throw new Error(`Missing classified manifest: ${classifiedManifestPath}`);
  }

  const classified = JSON.parse(fs.readFileSync(classifiedManifestPath, "utf8"));
  const copied = classified.copied || [];
  const data = readData();
  const uploadManifest = [];
  let inserted = 0;
  let alreadyPresent = 0;

  for (const item of copied) {
    const destPath = item.destPath;
    if (!fs.existsSync(destPath)) {
      throw new Error(`Missing copied image: ${destPath}`);
    }

    const info = assetInfo(destPath);
    await writeWebp(destPath, info.thumbPath, 560, 68);
    await writeWebp(destPath, info.previewPath, 1600, 78);

    uploadManifest.push({
      localPath: destPath,
      sourceFolder: info.sourceFolder,
      originalKey: info.originalKey,
      thumbKey: info.thumbKey,
      previewKey: info.previewKey,
      thumbPath: info.thumbPath,
      previewPath: info.previewPath,
      contentType: info.contentType,
    });

    const teacher = data.teachers.find((candidate) => candidate.folder === item.targetTeacherFolder || candidate.name === item.teacher);
    if (!teacher) throw new Error(`Teacher not found in data.js: ${item.targetTeacherFolder}`);

    const band = teacher.scoreBands.find((candidate) => candidate.rawName === item.band || candidate.name === cleanScoreBand(item.band));
    if (!band) throw new Error(`Band not found in data.js: ${item.targetTeacherFolder}/${item.band}`);

    const caseInfo = {
      name: path.basename(destPath, path.extname(destPath)),
      fileName: path.basename(destPath),
      src: info.thumbUrl,
      thumbUrl: info.thumbUrl,
      previewUrl: info.previewUrl,
      imageUrl: info.imageUrl,
      ...parseCaseName(path.basename(destPath), teacher.name),
    };

    if (band.cases.some((existing) => existing.imageUrl === caseInfo.imageUrl)) {
      alreadyPresent += 1;
      continue;
    }

    band.cases.push(caseInfo);
    inserted += 1;
  }

  data.generatedAt = new Date().toISOString();
  writeData(data);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(incrementalManifestPath, JSON.stringify(uploadManifest, null, 2), "utf8");

  console.log(JSON.stringify({
    copiedCount: copied.length,
    uploadManifestObjects: uploadManifest.length * 3,
    inserted,
    alreadyPresent,
    incrementalManifestPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
