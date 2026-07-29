// Turns brand_assets/logo.jpeg into a transparent-background PNG.
// White/near-white pixels become fully transparent; edges feather smoothly.

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const SRC = 'brand_assets/logo.jpeg';
const OUT = 'brand_assets/logo.png';

// Tuneables
const HARD_WHITE = 240;   // channel value above which a pixel is treated as "white"
const SOFT_WHITE = 200;   // below this, pixel keeps full alpha; between, alpha ramps
const SOFT_RANGE = HARD_WHITE - SOFT_WHITE;

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const px = Buffer.from(data);

for (let i = 0; i < px.length; i += channels) {
  const r = px[i], g = px[i+1], b = px[i+2];
  const minC = Math.min(r, g, b);

  if (minC >= HARD_WHITE) {
    px[i+3] = 0;
  } else if (minC > SOFT_WHITE) {
    // linear ramp between SOFT_WHITE (alpha 255) and HARD_WHITE (alpha 0)
    const t = (minC - SOFT_WHITE) / SOFT_RANGE;
    px[i+3] = Math.round(255 * (1 - t));
  }
}

await sharp(px, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(OUT);

console.log(`wrote ${OUT} (${width}x${height})`);
