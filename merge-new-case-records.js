const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = __dirname;
const dataPath = path.join(root, 'data.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, 'utf8'), context);
const data = context.window.CASE_DATA;
const records = JSON.parse(fs.readFileSync(path.join(root, 'outputs/r2-assets/new-case-records.json'), 'utf8'));

function bandFor(teacher, value) {
  const score = Number(value);
  const labels = teacher.scoreBands.map(b => b.name);
  const cutoffs = ['数学', '英语', '语文'].includes(teacher.subject) ? [60, 90, 110] : [40, 60, 85];
  const index = score < cutoffs[0] ? 0 : score < cutoffs[1] ? 1 : score < cutoffs[2] ? 2 : 3;
  const candidate = teacher.scoreBands.find(b => {
    if (index === 0) return /分以下/.test(b.name) && b.name.startsWith(String(cutoffs[0]));
    if (index === 1) return b.name.includes(`${cutoffs[0]}-${cutoffs[1]}`);
    if (index === 2) return b.name.includes(`${cutoffs[1]}-${cutoffs[2]}`);
    return b.name.includes(String(cutoffs[2])) && /以上|以上|85以上/.test(b.name);
  });
  return candidate || teacher.scoreBands.find(b => b.name === '其它');
}

let inserted = 0;
for (const record of records) {
  const teacher = data.teachers.find(t => t.name === record.teacher && t.subject === record.subject);
  if (!teacher) throw new Error(`Missing teacher ${record.teacher}/${record.subject}`);
  const band = bandFor(teacher, record.enrollment);
  if (!band) throw new Error(`Missing score band for ${record.teacher}/${record.enrollment}`);
  if (teacher.scoreBands.some(b => b.cases.some(c => c.imageUrl === record.imageUrl))) continue;
  band.cases.push({
    name: `${record.teacher}_${record.province}_${record.scoreText}_${record.id}`,
    fileName: path.basename(record.source),
    src: record.thumbUrl,
    thumbUrl: record.thumbUrl,
    previewUrl: record.previewUrl,
    imageUrl: record.imageUrl,
    province: record.province,
    scoreText: record.scoreText,
  });
  inserted++;
}
data.generatedAt = new Date().toISOString();
fs.writeFileSync(dataPath, `window.CASE_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
console.log(`Inserted ${inserted} / ${records.length} cases`);
