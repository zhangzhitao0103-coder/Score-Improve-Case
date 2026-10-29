import csv
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / '海报图片'
OUT = ROOT / 'outputs' / 'r2-assets'
BASE = 'https://pub-d82b16008394428c95e42b68dcde148f.r2.dev'

rows = list(csv.DictReader((SOURCE / '逐页字段与渲染报告.csv').open(encoding='utf-8-sig', newline='')))
files = {p.name: p for p in SOURCE.rglob('*.jpg')}
assert len(rows) == len(files) == 139
manifest, records = [], []
for row in rows:
    name = Path(row['output']).name
    source = files[name]
    identity = source.relative_to(SOURCE).as_posix()
    key = hashlib.sha1(('new-case-2026/' + identity).encode()).hexdigest()[:16]
    thumb_key, preview_key, original_key = f'thumbs/{key}.webp', f'previews/{key}.webp', f'originals/{key}.jpg'
    thumb_path, preview_path = OUT / thumb_key, OUT / preview_key
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert('RGB')
        for width, quality, dest in [(560, 68, thumb_path), (1600, 78, preview_path)]:
            dest.parent.mkdir(parents=True, exist_ok=True)
            resized = image.copy()
            resized.thumbnail((width, 10000))
            resized.save(dest, 'WEBP', quality=quality, method=4)
    manifest.append(dict(localPath=str(source), sourceFolder=source.parent.name,
                         originalKey=original_key, thumbKey=thumb_key, previewKey=preview_key,
                         thumbPath=str(thumb_path), previewPath=str(preview_path), contentType='image/jpeg'))
    province = row['province'].removesuffix('省').removesuffix('市')
    records.append(dict(id=key, source=identity, teacher=row['teacher'], subject=row['subject'],
                        student=source.stem.split('-', 2)[-1], province=province,
                        enrollment=row['enrollment_score'], exam=row['exam_score'],
                        scoreText=f"{row['enrollment_score']}分到{row['exam_score']}分",
                        thumbUrl=f'{BASE}/{thumb_key}', previewUrl=f'{BASE}/{preview_key}',
                        imageUrl=f'{BASE}/{original_key}'))
assert len({r['id'] for r in records}) == 139
(OUT / 'upload-manifest-new-cases.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'new-case-records.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Prepared {len(records)} cases and {len(manifest)*3} R2 objects')
