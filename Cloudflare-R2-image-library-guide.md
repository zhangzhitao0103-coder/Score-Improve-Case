# Cloudflare R2 图片素材筛选网页制作流程

本文档用于复用当前项目经验，制作新的“销售素材筛选展示网页”。适用场景：有上千张图片，需要销售按学科、省份、老师、分数段、类型等条件筛选、预览、复制或下载。

## 1. 推荐架构

```text
GitHub
  只放前端代码、数据索引、脚本

Cloudflare Pages
  托管静态网页

Cloudflare R2
  托管图片素材

前端 data.js / materials.json
  保存筛选字段和图片 URL
```

不要把大量图片直接放进 GitHub 或 Cloudflare Pages。GitHub 和 Pages 只适合放代码、HTML、CSS、JS、JSON 等轻量文件。图片统一放 R2。

## 2. R2 图片分层规则

每张图片生成三类文件：

```text
thumb：列表缩略图，建议 200KB 以内
preview：弹窗预览图，建议 500KB-1MB
original：高清原图，用于下载或高清查看
```

R2 bucket 中推荐目录结构：

```text
score-improve-cases/
├─ thumbs/
├─ previews/
└─ originals/
```

新项目也建议沿用这个结构。不要按老师、学科、省份建复杂 R2 目录，因为筛选信息应由数据索引管理，R2 只负责存图片。

## 3. Cloudflare R2 配置步骤

1. 进入 Cloudflare 控制台。
2. 打开 `Storage & databases`。
3. 选择 `R2 Object Storage`。
4. 点击 `Create bucket`。
5. Bucket 名称建议使用项目名，例如：

```text
score-improve-cases
```

6. Storage class 选择：

```text
Standard
```

7. 创建后进入 bucket 的 `Settings`。
8. 开启 `Public Development URL`。
9. 记录公共访问地址，例如：

```text
https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

这个地址会作为图片 URL 前缀。

## 4. R2 API Token 配置

进入 R2 API Token 页面，选择：

```text
Create Account API token
```

推荐配置：

```text
Token name:
project-name-uploader

Permission:
Object Read & Write

Bucket scope:
Apply to specific buckets
目标 bucket
```

生成后保存：

```text
Access Key ID
Secret Access Key
Endpoint / Account ID
```

本地新建 `.env.r2`，不要提交到 GitHub：

```text
CLOUDFLARE_ACCOUNT_ID=你的_account_id
R2_BUCKET=你的_bucket_name
R2_ACCESS_KEY_ID=你的_access_key_id
R2_SECRET_ACCESS_KEY=你的_secret_access_key
```

`.gitignore` 必须包含：

```text
.env
.env.*
!.env.r2.example
node_modules/
outputs/
```

## 5. CORS 配置

如果前端需要“复制图片本体”而不只是复制图片 URL，R2 需要配置 CORS。否则浏览器能显示图片，但 JS `fetch()` 图片时会失败。

进入 bucket 的 `Settings`，找到 `CORS Policy`，配置：

```json
[
  {
    "AllowedOrigins": [
      "https://你的-pages项目.pages.dev"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "ETag"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

如果本地开发也要测试复制图片，可以临时加入：

```text
http://127.0.0.1:8088
http://localhost:8088
```

## 6. 素材目录建议

源图片可以按业务逻辑组织，例如：

```text
素材汇总/
├─ 语文/
│  ├─ 广东/
│  ├─ 山东/
│  └─ 全国/
├─ 数学/
│  ├─ 广东/
│  └─ 浙江/
└─ 英语/
```

或者按老师组织：

```text
素材汇总/
├─ 语文姜博杨-提分案例/
│  ├─ 背书.png
│  ├─ 大招.png
│  ├─ 40分以下/
│  └─ 40-60分/
└─ 数学胡源-提分案例/
```

关键原则：

- 源图片目录是唯一真相。
- 不要手动维护图片 URL。
- 用脚本扫描目录生成数据索引。
- 删除图片时，先只从数据索引移除引用，不急着删 R2 旧对象。

## 7. 数据索引字段设计

新网页可根据业务调整字段。推荐每张图片最终生成类似数据：

```json
{
  "id": "auto-generated-id",
  "subject": "语文",
  "province": "广东",
  "teacher": "姜博杨",
  "category": "提分案例",
  "title": "姜博杨｜广东｜30分到60分",
  "thumbUrl": "https://pub-xxx.r2.dev/thumbs/xxx.webp",
  "previewUrl": "https://pub-xxx.r2.dev/previews/xxx.webp",
  "imageUrl": "https://pub-xxx.r2.dev/originals/xxx.png"
}
```

前端规则：

- 列表卡片只加载 `thumbUrl`
- 弹窗预览加载 `previewUrl`
- 下载或复制高清图时才加载 `imageUrl`

## 8. 前端性能规则

必须避免一次性加载全部图片。

推荐：

```text
默认显示 20 张
点击“继续加载”再显示 20 张
图片使用 loading="lazy"
图片使用 decoding="async"
```

不要让一个筛选结果一次渲染几百张高清图。

## 9. 上传流程

标准流程：

```bash
npm install
npm run build:r2-assets
npm run upload:r2-assets
```

当前项目脚本能力：

- `build-r2-assets.js`：扫描源目录，生成 `thumb / preview / data.js / upload-manifest.json`
- `upload-r2-assets.js`：根据 manifest 上传 R2，支持断点续传和重试
- `.env.r2`：保存本地 R2 凭据

生成时可指定源目录：

```powershell
$env:CASE_SOURCE_DIR="D:\path\to\素材汇总"
npm.cmd run build:r2-assets
```

上传：

```powershell
npm.cmd run upload:r2-assets
```

## 10. 小批量更新流程

如果只更新少量老师或少量目录，不要全量重传。

推荐提示词：

```text
我已在本地更新了图片素材，更新范围是：
路径：D:\...\素材汇总
变更类型：替换 / 增添 / 删除
我只更新了以下目录：
- 语文姜博杨-提分案例
- 数学胡源-提分案例

请只处理有改动的图片：
1. 重新扫描改动的素材目录
2. 只为新增或替换的图片生成 thumb / preview / original
3. 只上传 R2 缺失或内容已变化的对象
4. 更新 data.js
5. 本地验证老师数量、图片数量、抽样图片 URL
6. 验证成功后再提交并推送 GitHub
禁止全量重传，禁止删除本地图片素材。
```

脚本运行方式：

```powershell
$env:CASE_SOURCE_DIR="D:\...\素材汇总"
$env:CASE_FORCE_FOLDERS="语文姜博杨-提分案例,数学胡源-提分案例"
npm.cmd run build:r2-assets

$env:CASE_FORCE_FOLDERS="语文姜博杨-提分案例,数学胡源-提分案例"
npm.cmd run upload:r2-assets
```

含义：

- `CASE_SOURCE_DIR` 指定完整素材源目录。
- `CASE_FORCE_FOLDERS` 指定本次强制刷新目录。
- 同路径替换的图片会重新生成缩略图和预览图。
- 同 key 已上传对象会被覆盖。
- 未改动目录不会重传。

## 11. 删除策略

建议默认策略：

```text
删除的图片只从 data.js 移除引用，暂不删除 R2 旧对象。
```

原因：

- 防止误删线上可用图片。
- R2 10GB 免费存储早期足够用。
- 等页面确认无误后，再单独清理未引用对象。

如果后续要清理 R2，应先生成“当前 data.js 引用 key 列表”，再删除不再引用的旧 key。

## 12. 验证清单

每次上线前至少验证：

```text
1. data.js 可正常解析
2. 老师 / 学科 / 省份等筛选项数量正确
3. 更新目录图片数量正确
4. 抽样 thumbUrl 返回 200
5. 抽样 previewUrl 返回 200
6. 抽样 imageUrl 返回 200
7. thumb 全部低于 200KB
8. preview 全部低于 1MB
9. Git diff 不包含图片素材、zip、密钥文件
```

## 13. GitHub 和 Pages 部署

GitHub 只提交：

```text
index.html
styles.css
app.js
data.js
package.json
package-lock.json
脚本文件
README / 文档
```

不要提交：

```text
源图片目录
outputs/
node_modules/
.env.r2
zip / 7z
```

Cloudflare Pages 设置：

```text
Framework preset: None
Build command: 留空 或 exit 0
Build output directory: /
Production branch: main
```

推送 GitHub 后，Pages 会自动部署。

## 14. 新网页制作建议

如果新网页主要按学科、省份筛选，可以优先设计：

```text
学科筛选：语文 / 数学 / 英语 / 物理 / 化学 / 生物 / 历史 / 地理 / 政治
省份筛选：全国 / 北京 / 天津 / 河北 ...
类型筛选：提分案例 / 喜报 / 课程海报 / 赠礼 / 资料包
关键词搜索：文件名、标题、老师名
```

前端首屏不做宣传页，直接进入素材筛选工具。

推荐页面结构：

```text
左侧：筛选条件
右侧：图片结果网格
顶部：当前筛选摘要和数量
卡片：缩略图 + 标题 + 复制 / 下载按钮
弹窗：预览图 + 下载高清图
```

## 15. 安全提醒

- 不要把 R2 Secret Access Key 发到聊天、截图或 GitHub。
- 如果密钥截图外传，应立刻删除 token 并重新创建。
- `.env.r2` 必须在 `.gitignore` 中。
- 公开 R2 bucket 适合公开销售素材，不适合存放隐私或敏感资料。

---

# 本项目后续增删改操作附录

本附录是本项目的实际执行规范。以后新开对话时，只需要提供新素材文件夹、变更类型和处理范围，按本附录执行即可。

## A. 当前项目文件职责

项目根目录：

```text
D:\销售转化策略\提分案例
```

应该提交到 GitHub 的主要文件：

```text
index.html                         页面结构、老师隐藏/显示配置
styles.css                         页面样式
app.js                             筛选、分页、预览、下载、复制逻辑
data.js                            老师、分数段、图片字段、R2 URL
package.json                       npm 命令和依赖
package-lock.json                  依赖锁定
build-r2-assets.js                 全量扫描和生成资源
classify-updated-cases.js          新增案例按老师和分数段分类
build-incremental-case-assets.js   增量案例生成 thumb/preview 和 data.js
replace-profile-images.js          老师个人介绍图片替换
upload-r2-assets.js                按 manifest 上传 R2
retire-incremental-case-update.js  历史增量批次本地隔离
delete-retired-r2-objects.js       按清单清理旧 R2 对象
configure-r2-cors.js               R2 CORS 配置脚本
Cloudflare-R2-image-library-guide.md 本操作手册
```

只在本地使用、禁止提交 GitHub 的内容：

```text
Score-improve-cases-main/          完整本地图片素材库
提分案例汇总/                      旧素材目录或临时素材
提分案例-更新版-v2/                新版待处理图片
提分案例-更新版/                   历史待处理图片
调整/                              老师个人介绍图片来源
outputs/                           生成资源、manifest、备份和上传状态
node_modules/                      npm 依赖
.env.r2                            R2 密钥
*.zip、*.7z                        原始压缩包
```

当前 R2 配置：

```text
Bucket: score-improve-cases
Public URL: https://pub-d82b16008394428c95e42b68dcde148f.r2.dev
```

R2 对象规则：

```text
thumbs/<hash>.webp       列表缩略图，目标不超过 200KB
previews/<hash>.webp     弹窗预览图，目标 500KB-1MB
originals/<hash>.<ext>   高清原图
```

## B. 变更总原则

所有图片任务都遵循：

```text
重新读取新目录
→ 统计图片、老师和匹配情况
→ 生成变更清单
→ 本地执行变更
→ 只生成本批次三类资源
→ 只上传本批次 R2 对象
→ 更新 data.js
→ 本地和线上验证
→ Git diff 检查
→ 提交并推送 GitHub
```

必须遵守：

- 新目录缺少某张图片时，不自动判断为删除。
- 不全量扫描、全量压缩或全量上传，除非用户明确要求全量重建。
- 不删除本地素材，默认移动到 `outputs` 下的隔离目录。
- 不删除 R2 对象，除非用户明确要求，并且完成 `data.js` 引用检查。
- 不修改与图片任务无关的筛选逻辑。
- 不把图片、`outputs/`、`.env.r2`、压缩包提交到 GitHub。

每次处理都要记录：

```text
来源路径、目标路径、变更类型、SHA1、R2 key、data.js 是否变化
```

## C. 新增提分案例

适用情况：新文件没有对应的旧图片，需要加入老师的分数段。

推荐新素材结构：

```text
提分案例-更新版-v3/
├─ 胡源/
│  ├─ 胡源_安徽_31分到90分.png
│  └─ 胡源_广东_50分到80分.png
└─ 姜博杨/
   └─ 姜博杨_山东_60分到95分.png
```

脚本根据老师名称匹配目标目录，再根据文件名中的第一个数字判断分数段。目标分数段没有匹配项时使用“其他”目录；没有对应老师目录时跳过并报告。

推荐新对话提示词：

```text
请按照 Cloudflare-R2-image-library-guide.md 执行新增提分案例。

新素材目录：D:\销售转化策略\提分案例\提分案例-更新版-v3
变更类型：新增
处理范围：该目录下全部图片

要求：
1. 重新读取并统计新目录，不沿用上次统计
2. 按老师名称和第一个数字完成分数段分类
3. 重名自动加编号，不覆盖已有图片
4. 只生成本次新增图片的 thumb、preview、original
5. 只上传本次新增对象到 R2
6. 更新 data.js
7. 验证老师数、图片数、抽样 URL 和 HTTP 状态
8. 成功后提交并推送 GitHub

禁止全量重传，禁止删除本地图片，禁止处理无法匹配的老师目录。
```

执行命令：

```powershell
$env:CASE_UPDATE_ROOT="D:\销售转化策略\提分案例\提分案例-更新版-v3"
$env:CASE_TARGET_ROOT="D:\销售转化策略\提分案例\Score-improve-cases-main\提分案例汇总"
node classify-updated-cases.js
```

确认 `copiedCount`、`unmatchedCount`、`errorCount` 后：

```powershell
$env:CASE_TARGET_ROOT="D:\销售转化策略\提分案例\Score-improve-cases-main\提分案例汇总"
$env:CLASSIFIED_CASE_MANIFEST="D:\销售转化策略\提分案例\outputs\incremental-case-updates\classified-new-images-latest.json"
node build-incremental-case-assets.js
```

只上传本批次：

```powershell
$env:R2_UPLOAD_MANIFEST_PATH="D:\销售转化策略\提分案例\outputs\r2-assets\upload-manifest-incremental.json"
$manifest=Get-Content -Raw -Encoding UTF8 $env:R2_UPLOAD_MANIFEST_PATH | ConvertFrom-Json
$env:CASE_FORCE_FOLDERS=(($manifest | ForEach-Object sourceFolder | Sort-Object -Unique) -join ',')
npm.cmd run upload:r2-assets
```

## D. 替换已有提分案例

适用情况：文件名和目标路径不变，但图片内容错误、模糊或需要改版。

标准顺序：

1. 核对源图和目标图，比较大小和 SHA1。
2. 将旧图备份到 `outputs/replaced-case-images/<时间>/`。
3. 覆盖本地目标图片。
4. 按原目标路径重新生成对应 thumb 和 preview。
5. 强制覆盖 R2 的 original、thumb、preview 三个对象。
6. 在 `data.js` URL 后增加 `?v=版本号`，解决长期缓存。
7. 抽样检查三个 URL 均返回 200。
8. 提交并推送 `data.js`。

替换提示词模板：

```text
请替换以下提分案例图片：

旧图：填写完整目标路径
新图：填写完整源图路径
变更类型：替换

要求：
1. 先核对两张图片并备份旧图
2. 只替换这一个目标文件
3. 只生成并上传该图片的 thumb、preview、original
4. 更新 data.js 的缓存版本参数
5. 验证三个 R2 URL 返回 200
6. 成功后提交并推送 GitHub

禁止全量重传，禁止删除旧图备份。
```

如果替换时更改了文件名或目标路径，必须同时记录旧 key 和新 key。新版上线确认前，旧 R2 key 默认保留。

## E. 删除和下架

删除必须区分三种情况：

```text
暂时隐藏：只改页面展示，保留本地和 R2
下架：从 data.js 移除，图片移动到隔离目录，R2 暂保留
永久删除：明确确认后，清理未引用的 R2 key
```

下架流程：

1. 根据精确路径定位图片。
2. 备份或移动到 `outputs/retired-case-images/<时间>/`。
3. 从 `data.js` 移除对应记录。
4. 本地验证页面不再展示。
5. 默认不删除 R2。

永久清理前必须确认目标 key 不再被 `data.js` 引用，也没有被其他图片复用。清理后用 R2 HEAD 或公开 URL 验证 404。

不要因为新素材目录缺少某些旧图片就自动执行删除。

## F. 老师个人介绍图片

来源目录：

```text
调整/调整/<老师名>/
```

命名映射：

```text
优秀学员版-老师名字_序号       → 优秀学员.png
主理人+提分截图-优化版_序号     → 提分案例.png
主理人背书-老师名字_序号        → 背书.png
主理人大招-老师名字_序号        → 大招.png
```

执行：

```powershell
npm.cmd run replace:profile-images
```

然后使用：

```text
outputs/r2-assets/upload-manifest-profile-replacements.json
```

设置 `R2_UPLOAD_MANIFEST_PATH` 后，只上传该清单，并对对应老师目录强制覆盖。个人介绍替换也要备份旧图并检查缓存版本。

## G. 验证清单

每次完成后必须检查：

```text
data.js 可以正常解析
老师数量正确
新增/替换/下架数量与清单一致
没有误改其他老师目录
thumb 和 preview 文件存在
thumb 不超过 200KB
preview 目标不超过 1MB
抽样 thumb URL 返回 200
抽样 preview URL 返回 200
抽样 original URL 返回 200
git diff --check 无错误
Git diff 未包含图片、outputs、密钥和压缩包
```

删除任务另外检查目标 URL 返回 404。

## H. GitHub 和 Pages

提交前只暂存明确的代码、`data.js` 和文档：

```powershell
git add -- data.js 相关脚本.md
git diff --cached --stat
git commit -m "Update image assets"
git push origin main
```

Cloudflare Pages 已连接 GitHub 的 `main` 分支，推送成功后自动部署。只覆盖 R2 内容但不修改 `data.js` 时，Pages 不一定需要重新部署；替换图片建议修改 URL 版本参数并推送 `data.js`，确保浏览器请求新版。

## I. 新对话开场模板

以后可以直接发送：

```text
请按照项目中的 Cloudflare-R2-image-library-guide.md 执行图片更新。

素材目录：D:\销售转化策略\提分案例\提分案例-更新版-v3
变更类型：新增 / 替换 / 删除 / 混合
处理范围：填写老师目录或图片名单

要求：
1. 先重新读取和统计我提供的目录
2. 只处理本次明确范围
3. 先生成变更清单，再执行本地操作
4. 只生成和上传本次变化图片的三类资源
5. 替换时备份旧图并处理浏览器缓存
6. 删除时默认隔离，不直接永久删除
7. 更新 data.js
8. 验证老师数、图片数、抽样 R2 URL 和 HTTP 状态
9. 成功后提交并推送 GitHub
10. 汇报处理数量、跳过数量、备份路径、commit 和推送结果

禁止全量重传，禁止误删未指定图片，禁止提交本地素材和 R2 密钥。
```
