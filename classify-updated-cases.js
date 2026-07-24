const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const updateRoot = path.join(__dirname, "提分案例-更新版");
const targetRoot = path.join(__dirname, "Score-improve-cases-main", "提分案例汇总");
const outputDir = path.join(__dirname, "outputs", "incremental-case-updates");
const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];

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

function firstNumber(fileName) {
  const match = fileName.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseBand(folderName) {
  if (folderName.includes("其它") || folderName.includes("其他")) {
    return { type: "other", folderName };
  }

  const numbers = [...folderName.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  if (folderName.includes("以下") && numbers.length >= 1) {
    return { type: "below", max: numbers[0], folderName };
  }
  if (folderName.includes("以上") && numbers.length >= 1) {
    return { type: "above", min: numbers[0], folderName };
  }
  if (numbers.length >= 2) {
    return { type: "range", min: numbers[0], max: numbers[1], folderName };
  }

  return { type: "unknown", folderName };
}

function chooseBand(score, bands) {
  const other = bands.find((band) => band.type === "other");
  if (score === null || Number.isNaN(score)) return other;

  const match = bands.find((band) => {
    if (band.type === "below") return score < band.max;
    if (band.type === "range") return score >= band.min && score < band.max;
    if (band.type === "above") return score >= band.min;
    return false;
  });

  return match || other;
}

function uniqueDestination(destDir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(destDir, fileName);
  let index = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(destDir, `${base}_${index}${ext}`);
    index += 1;
  }

  return candidate;
}

function sha1(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function walkImages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkImages(fullPath);
    if (entry.isFile() && isImage(entry.name)) return [fullPath];
    return [];
  });
}

function main() {
  if (!fs.existsSync(updateRoot)) throw new Error(`Missing update folder: ${updateRoot}`);
  if (!fs.existsSync(targetRoot)) throw new Error(`Missing target folder: ${targetRoot}`);

  fs.mkdirSync(outputDir, { recursive: true });

  const targetTeachers = new Map();
  for (const entry of fs.readdirSync(targetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const parsed = parseTeacher(entry.name);
    targetTeachers.set(parsed.name, {
      ...parsed,
      folderName: entry.name,
      fullPath: path.join(targetRoot, entry.name),
    });
  }

  const copied = [];
  const unmatched = [];
  const errors = [];

  for (const entry of fs.readdirSync(updateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const updateTeacherName = entry.name.trim();
    const targetTeacher = targetTeachers.get(updateTeacherName);
    const updateTeacherPath = path.join(updateRoot, entry.name);
    const sourceImages = walkImages(updateTeacherPath);

    if (!targetTeacher) {
      unmatched.push({
        teacher: updateTeacherName,
        sourceFolder: updateTeacherPath,
        imageCount: sourceImages.length,
        files: sourceImages.map((filePath) => path.relative(updateRoot, filePath)),
      });
      continue;
    }

    const bands = fs.readdirSync(targetTeacher.fullPath, { withFileTypes: true })
      .filter((bandEntry) => bandEntry.isDirectory())
      .map((bandEntry) => parseBand(bandEntry.name));

    for (const sourcePath of sourceImages) {
      const score = firstNumber(path.basename(sourcePath));
      const band = chooseBand(score, bands);
      if (!band) {
        errors.push({
          sourcePath,
          teacher: updateTeacherName,
          reason: "No matching score band and no other folder",
        });
        continue;
      }

      const destDir = path.join(targetTeacher.fullPath, band.folderName);
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = uniqueDestination(destDir, path.basename(sourcePath));
      fs.copyFileSync(sourcePath, destPath);

      copied.push({
        teacher: updateTeacherName,
        targetTeacherFolder: targetTeacher.folderName,
        score,
        band: band.folderName,
        sourcePath,
        destPath,
        destRelativeToCaseRoot: path.relative(targetRoot, destPath),
        sourceSha1: sha1(sourcePath),
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    updateRoot,
    targetRoot,
    copiedCount: copied.length,
    unmatchedCount: unmatched.length,
    errorCount: errors.length,
    copied,
    unmatched,
    errors,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestPath = path.join(outputDir, `classified-new-images-${stamp}.json`);
  const latestPath = path.join(outputDir, "classified-new-images-latest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(JSON.stringify({
    copiedCount: copied.length,
    unmatchedCount: unmatched.length,
    errorCount: errors.length,
    manifestPath,
    latestPath,
  }, null, 2));
}

main();
