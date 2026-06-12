const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "提分案例汇总");
const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
const provinces = [
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江", "上海", "江苏", "浙江",
  "安徽", "福建", "江西", "山东", "河南", "湖北", "湖南", "广东", "广西", "海南", "重庆",
  "四川", "贵州", "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆"
];
const profileOrder = ["背书", "大招", "优秀学员", "提分案例"];

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

function readImageFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isImage(entry.name))
    .map((entry) => {
      const fullPath = path.join(dir, entry.name);
      return {
        name: path.basename(entry.name, path.extname(entry.name)),
        fileName: entry.name,
        src: toWebPath(fullPath),
      };
    })
    .sort((a, b) => profileImageRank(a.name) - profileImageRank(b.name) || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function profileImageRank(name) {
  const index = profileOrder.findIndex((keyword) => name.includes(keyword));
  return index === -1 ? profileOrder.length : index;
}

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

const data = {
  generatedAt: new Date().toISOString(),
  provinces,
  teachers,
};

fs.writeFileSync(
  path.join(__dirname, "data.js"),
  `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`,
  "utf8"
);

console.log(`Generated data.js: ${teachers.length} teachers`);
