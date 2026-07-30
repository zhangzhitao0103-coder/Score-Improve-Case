const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const caseRoot = path.resolve(__dirname, "Score-improve-cases-main", "提分案例汇总");
const outputDir = path.join(__dirname, "outputs", "r2-assets");
const manifestPath = path.join(outputDir, "upload-manifest-new-teachers.json");
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "https://pub-d82b16008394428c95e42b68dcde148f.r2.dev").replace(/\/$/, "");
const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const teachersToAdd = [
  { subject: "英语", name: "杨文哲", folder: "英语杨文哲-提分案例" },
  { subject: "地理", name: "钱叶茂", folder: "地理钱叶茂-提分案例" },
  { subject: "化学", name: "贺涵", folder: "化学贺涵-提分案例" },
];

function readData() {
  const text = fs.readFileSync(path.join(__dirname, "data.js"), "utf8");
  const match = text.match(/^window\.CASE_DATA\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error("Unable to parse data.js");
  return JSON.parse(match[1]);
}

function writeData(data) {
  fs.writeFileSync(path.join(__dirname, "data.js"), `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
}

function isImage(fileName) {
  return imageExts.has(path.extname(fileName).toLowerCase());
}

function walkImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkImages(fullPath);
    return entry.isFile() && isImage(entry.name) ? [fullPath] : [];
  });
}

function toWebPath(filePath) {
  return ["提分案例汇总", ...path.relative(caseRoot, filePath).split(path.sep)]
    .map(encodeURIComponent)
    .join("/");
}

function assetInfo(filePath) {
  const webPath = toWebPath(filePath);
  const hash = crypto.createHash("sha1").update(webPath).digest("hex").slice(0, 16);
  const ext = path.extname(filePath).toLowerCase();
  const originalKey = `originals/${hash}${ext === ".jpeg" ? ".jpg" : ext}`;
  return {
    sourceFolder: path.relative(caseRoot, filePath).split(path.sep)[0],
    originalKey,
    thumbKey: `thumbs/${hash}.webp`,
    previewKey: `previews/${hash}.webp`,
    thumbPath: path.join(outputDir, `thumbs/${hash}.webp`),
    previewPath: path.join(outputDir, `previews/${hash}.webp`),
    thumbUrl: `${publicBaseUrl}/thumbs/${hash}.webp`,
    previewUrl: `${publicBaseUrl}/previews/${hash}.webp`,
    imageUrl: `${publicBaseUrl}/${originalKey}`,
    contentType: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg",
  };
}

function cleanBandName(rawName) {
  return rawName.replace(/^[①②③④⑤]\s*/, "").trim();
}

function parseCaseName(filePath, teacherName) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const text = baseName.replace(new RegExp(`^${teacherName}_?`), "");
  return { province: "", scoreText: text || baseName };
}

function publicItem(filePath, teacherName, isCase) {
  const info = assetInfo(filePath);
  const item = {
    name: path.basename(filePath, path.extname(filePath)),
    fileName: path.basename(filePath),
    src: info.thumbUrl,
    thumbUrl: info.thumbUrl,
    previewUrl: info.previewUrl,
    imageUrl: info.imageUrl,
  };
  if (isCase) Object.assign(item, parseCaseName(filePath, teacherName));
  return { item, asset: { localPath: filePath, ...info } };
}

async function writeWebp(inputPath, outputPath, width, quality) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(inputPath, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 4 }).toFile(outputPath);
}

async function main() {
  const data = readData();
  const existing = new Set(data.teachers.map((teacher) => teacher.name));
  const assets = [];
  const added = [];

  for (const spec of teachersToAdd) {
    if (existing.has(spec.name)) throw new Error(`Teacher already exists in data.js: ${spec.name}`);
    const teacherDir = path.join(caseRoot, spec.folder);
    if (!fs.existsSync(teacherDir)) throw new Error(`Missing teacher directory: ${teacherDir}`);

    const profileItems = fs.readdirSync(teacherDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isImage(entry.name))
      .map((entry) => publicItem(path.join(teacherDir, entry.name), spec.name, false));
    const scoreBands = fs.readdirSync(teacherDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const bandDir = path.join(teacherDir, entry.name);
        const cases = walkImages(bandDir).map((filePath) => publicItem(filePath, spec.name, true));
        return {
          rawName: entry.name,
          name: cleanBandName(entry.name),
          cases: cases.map(({ item }) => item),
        };
      });

    for (const entry of [...profileItems, ...scoreBands.flatMap((band) => band.cases.map((item) => ({ item, filePath: path.join(teacherDir, band.rawName, item.fileName) })))] ) {
      const filePath = entry.filePath || path.join(teacherDir, entry.item.fileName);
      const built = publicItem(filePath, spec.name, Boolean(entry.filePath));
      assets.push(built.asset);
    }

    added.push({
      id: `${spec.subject}-${spec.name}`,
      name: spec.name,
      subject: spec.subject,
      folder: spec.folder,
      profileImages: profileItems.map(({ item }) => item),
      scoreBands,
    });
  }

  for (const asset of assets) {
    await writeWebp(asset.localPath, asset.thumbPath, 560, 68);
    await writeWebp(asset.localPath, asset.previewPath, 1600, 78);
  }

  data.teachers.push(...added);
  data.generatedAt = new Date().toISOString();
  writeData(data);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(assets, null, 2), "utf8");
  console.log(JSON.stringify({ teachersAdded: added.map((teacher) => teacher.name), profileCount: added.reduce((n, t) => n + t.profileImages.length, 0), caseCount: added.reduce((n, t) => n + t.scoreBands.reduce((m, b) => m + b.cases.length, 0), 0), imageCount: assets.length, uploadManifestObjects: assets.length * 3, manifestPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
