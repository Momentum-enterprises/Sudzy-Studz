/**
 * optimize-images.js
 * Reads originals from /images-original, writes optimized WebP files to original locations.
 * Run: node optimize-images.js
 */

import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

const SRC = 'images-original';

const JOBS = [
  // ── GALLERY PHOTOS ─── max 2000px long edge, quality 82
  { src: `${SRC}/assets/lexus side.jpeg`,    dest: 'assets/lexus side.webp',    group: 'gallery'  },
  { src: `${SRC}/assets/lexus interior.jpeg`,dest: 'assets/lexus interior.webp',group: 'gallery'  },
  { src: `${SRC}/assets/bmw side.jpg`,       dest: 'assets/bmw side.webp',      group: 'gallery'  },
  { src: `${SRC}/assets/bmw interior.webp`,  dest: 'assets/bmw interior.webp',  group: 'gallery'  },

  // ── TEAM PORTRAITS ─── fit inside 600×600, quality 82
  { src: `${SRC}/assets/brody1.png`,         dest: 'assets/brody1.webp',        group: 'portrait' },
  { src: `${SRC}/assets/james.jpeg`,         dest: 'assets/james.webp',         group: 'portrait' },
  { src: `${SRC}/assets/daniel.png`,         dest: 'assets/daniel.webp',        group: 'portrait' },
  { src: `${SRC}/assets/Owen.JPG`,           dest: 'assets/Owen.webp',          group: 'portrait' },

  // ── LOGO ─── max 800px wide, quality 85, preserve alpha
  { src: `${SRC}/brand_assets/logo.png`,     dest: 'brand_assets/logo.webp',    group: 'logo'     },
];

const fmtBytes = (b) => b >= 1024 * 1024
  ? `${(b / 1024 / 1024).toFixed(2)} MB`
  : `${(b / 1024).toFixed(1)} KB`;

const rows = [];
let totalBefore = 0;
let totalAfter  = 0;

for (const job of JOBS) {
  const { data: srcMeta } = await sharp(job.src).metadata().then(m => ({ data: m })).catch(() => ({ data: null }));
  const srcStat  = await stat(job.src);
  const beforeBytes = srcStat.size;

  let pipeline = sharp(job.src).webp({ quality: job.group === 'logo' ? 85 : 82 });

  if (job.group === 'gallery') {
    pipeline = sharp(job.src)
      .rotate()                                       // auto-orient from EXIF before stripping
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 });
  } else if (job.group === 'portrait') {
    pipeline = sharp(job.src)
      .rotate()
      .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 });
  } else if (job.group === 'logo') {
    pipeline = sharp(job.src)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 85, lossless: false });
  }

  const { data: outBuf, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const afterBytes = outBuf.length;

  // Write to dest
  await sharp(outBuf).toFile(job.dest);

  const saved = ((beforeBytes - afterBytes) / beforeBytes * 100).toFixed(1);
  totalBefore += beforeBytes;
  totalAfter  += afterBytes;

  rows.push({ file: job.dest, before: beforeBytes, after: afterBytes, saved, w: info.width, h: info.height });

  console.log(`✓ ${job.dest}  (${info.width}×${info.height})`);
}

// Print table
const COL = { file: 36, before: 10, after: 10, saved: 8 };
console.log('\n' + '─'.repeat(70));
console.log(
  'File'.padEnd(COL.file) +
  'Before'.padStart(COL.before) +
  'After'.padStart(COL.after) +
  'Saved'.padStart(COL.saved) +
  '  Dimensions'
);
console.log('─'.repeat(70));
for (const r of rows) {
  console.log(
    r.file.padEnd(COL.file) +
    fmtBytes(r.before).padStart(COL.before) +
    fmtBytes(r.after).padStart(COL.after) +
    `${r.saved}%`.padStart(COL.saved) +
    `  ${r.w}×${r.h}`
  );
}
console.log('─'.repeat(70));
const totalSaved = ((totalBefore - totalAfter) / totalBefore * 100).toFixed(1);
console.log(
  'TOTAL'.padEnd(COL.file) +
  fmtBytes(totalBefore).padStart(COL.before) +
  fmtBytes(totalAfter).padStart(COL.after) +
  `${totalSaved}%`.padStart(COL.saved)
);
console.log('─'.repeat(70) + '\n');

// Warn on anything over 300 KB
const overLimit = rows.filter(r => r.after > 300 * 1024);
if (overLimit.length) {
  console.log('⚠️  Files over 300 KB after optimization:');
  overLimit.forEach(r => console.log(`   ${r.file}  ${fmtBytes(r.after)}`));
} else {
  console.log('✅  All files are under 300 KB.');
}
