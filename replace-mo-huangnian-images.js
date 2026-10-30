const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const vm = require("vm");

const root = __dirname;
const sourceDir = path.join(root, "主讲老师介绍修改", "莫荒年");
const targetDir = path.join(root, "Score-improve-cases-main", "提分案例汇总", "物理莫荒年-提分案例");
const assetsDir = path.join(root, "outputs", "r2-assets");
const mapping = new Map([
  ["背书", "主理人背书-莫荒年_01.png"],
  ["大招", "主理人大招-莫荒年老师_01.png"],
  ["优秀学员", "优秀学员版-莫荒年老师_01.png"],
  ["提分案例", "主理人+提分截图-优化版_11.png"],
]);

async function main() {
  const dataPath = path.join(root, "data.js");
  let dataText = fs.readFileSync(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(dataText, sandbox, { filename: dataPath });
  const data = sandbox.window.CASE_DATA;
  const teacher = data.teachers.find((item) => item.name === "莫荒年" && item.subject === "物理");
  if (!teacher || teacher.profileImages.length !== 4) throw new Error("莫荒年图片数据不符合预期");

  const manifest = [];
  for (const item of teacher.profileImages) {
    const sourceName = mapping.get(item.name);
    if (!sourceName) throw new Error(`未知图片类别: ${item.name}`);
    const sourcePath = path.join(sourceDir, sourceName);
    const targetPath = path.join(targetDir, item.fileName);
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) throw new Error(`缺少图片: ${sourcePath} / ${targetPath}`);

    fs.copyFileSync(sourcePath, targetPath);
    const thumbKey = new URL(item.thumbUrl).pathname.slice(1);
    const previewKey = new URL(item.previewUrl).pathname.slice(1);
    const originalKey = new URL(item.imageUrl).pathname.slice(1);
    const thumbPath = path.join(assetsDir, thumbKey);
    const previewPath = path.join(assetsDir, previewKey);
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    await sharp(targetPath).rotate().resize({ width: 560, withoutEnlargement: true }).webp({ quality: 68, effort: 4 }).toFile(thumbPath);
    await sharp(targetPath).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(previewPath);

    // Existing R2 keys are overwritten; query versions bypass cached copies.
    const version = `v=${fs.statSync(sourcePath).size}`;
    for (const field of ["src", "thumbUrl", "previewUrl", "imageUrl"]) {
      const oldUrl = item[field];
      const newUrl = `${oldUrl.split("?")[0]}?${version}`;
      dataText = dataText.replaceAll(`"${oldUrl}"`, `"${newUrl}"`);
      item[field] = newUrl;
    }
    manifest.push({ localPath: targetPath, sourceFolder: "物理莫荒年-提分案例", originalKey, thumbKey, previewKey, thumbPath, previewPath, contentType: "image/png" });
  }
  fs.writeFileSync(dataPath, dataText);
  const manifestPath = path.join(assetsDir, "upload-manifest-mo-huangnian.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`已更新 ${manifest.length} 张图片；上传清单: ${manifestPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
