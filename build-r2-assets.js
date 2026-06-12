const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const rootDir = path.join(__dirname, "提分案例汇总");
const outputDir = path.join(__dirname, "outputs", "r2-assets");
const manifestPath = path.join(outputDir, "upload-manifest.json");
const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || "https://pub-d82b16008394428c95e42b68dcde148f.r2.dev").replace(/\/$/, "");

const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
const provinces = [
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江",
  "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆",
  "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆"
];
const profileOrder = ["背书", "大招", "优秀学员", "提分案例"];
const contentTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

function isImage(fileName) {
  return imageExts.has(path.extname(fileName).toLowerCase());
}

function toWebPath(filePath) {
  return path.relative(__dirname, filePath).split(path.sep).map(encodeURIComponent).join("/");
}

function parseTeacher(folderName) {
  const clean = folderName.replace(/-提分案例$/, "").trim();
  const subject = subjects.find((item) => clean.startsWith(item)) || "";
  return {
    subject,
    name: subject ? clean.slice(subject.length) : clean,
  };
}

function cleanScoreBand(folderName) {
  return folderName.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").trim();
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

  const firstToken = text.split("_")[0];
  const normalizedProvince = normalizeProvince(firstToken);
  if (normalizedProvince) {
    province = normalizedProvince;
    text = text.slice(firstToken.length).replace(/^_/, "");
  }

  return {
    province,
    scoreText: text || baseName,
  };
}

function profileImageRank(name) {
  const index = profileOrder.findIndex((keyword) => name.includes(keyword));
  return index === -1 ? profileOrder.length : index;
}

function hashKey(webPath) {
  return crypto.createHash("sha1").update(webPath).digest("hex").slice(0, 16);
}

function assetInfo(fullPath) {
  const webPath = toWebPath(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const hash = hashKey(webPath);
  const originalKey = `originals/${hash}${ext === ".jpeg" ? ".jpg" : ext}`;
  const thumbKey = `thumbs/${hash}.webp`;
  const previewKey = `previews/${hash}.webp`;

  return {
    webPath,
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

function publicImageItem(fullPath) {
  const info = assetInfo(fullPath);
  return {
    name: path.basename(fullPath, path.extname(fullPath)),
    fileName: path.basename(fullPath),
    src: info.thumbUrl,
    thumbUrl: info.thumbUrl,
    previewUrl: info.previewUrl,
    imageUrl: info.imageUrl,
    _asset: {
      localPath: fullPath,
      originalKey: info.originalKey,
      thumbKey: info.thumbKey,
      previewKey: info.previewKey,
      thumbPath: info.thumbPath,
      previewPath: info.previewPath,
      contentType: info.contentType,
    },
  };
}

function readImageFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => publicImageItem(path.join(dir, entry.name)))
    .sort((a, b) => profileImageRank(a.name) - profileImageRank(b.name) || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function cleanForData(item) {
  const { _asset, ...publicItem } = item;
  return publicItem;
}

async function ensureWebp(inputPath, outputPath, width, quality) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) return;

  await sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toFile(outputPath);
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

async function main() {
  const manifest = [];

  const teachers = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith("-提分案例"))
    .map((entry) => {
      const dir = path.join(rootDir, entry.name);
      const { subject, name } = parseTeacher(entry.name);
      const profileImages = readImageFiles(dir);

      const scoreBands = fs.readdirSync(dir, { withFileTypes: true })
        .filter((bandEntry) => bandEntry.isDirectory())
        .map((bandEntry) => {
          const bandDir = path.join(dir, bandEntry.name);
          const cases = readImageFiles(bandDir).map((item) => ({
            ...item,
            ...parseCaseName(item.fileName, name),
          }));

          return {
            rawName: bandEntry.name,
            name: cleanScoreBand(bandEntry.name),
            cases,
          };
        });

      return {
        id: `${subject}-${name}`,
        name,
        subject,
        folder: entry.name,
        profileImages,
        scoreBands,
      };
    })
    .sort((a, b) => `${a.subject}${a.name}`.localeCompare(`${b.subject}${b.name}`, "zh-Hans-CN"));

  for (const teacher of teachers) {
    for (const item of teacher.profileImages) manifest.push(item._asset);
    for (const band of teacher.scoreBands) {
      for (const item of band.cases) manifest.push(item._asset);
    }
  }

  console.log(`Generating thumbnails/previews for ${manifest.length} images...`);
  await mapLimit(manifest, 4, async (asset, currentIndex) => {
    await ensureWebp(asset.localPath, asset.thumbPath, 560, 68);
    await ensureWebp(asset.localPath, asset.previewPath, 1600, 78);
    if (currentIndex % 100 === 0 || currentIndex === manifest.length) {
      console.log(`Processed ${currentIndex}/${manifest.length}`);
    }
  });

  const data = {
    generatedAt: new Date().toISOString(),
    provinces,
    teachers: teachers.map((teacher) => ({
      ...teacher,
      profileImages: teacher.profileImages.map(cleanForData),
      scoreBands: teacher.scoreBands.map((band) => ({
        ...band,
        cases: band.cases.map(cleanForData),
      })),
    })),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, "data.js"),
    `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`,
    "utf8"
  );
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated data.js and ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
