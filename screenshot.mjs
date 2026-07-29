#!/usr/bin/env node
// Usage: node screenshot.mjs <url> [label]
// Saves to ./temporary screenshots/screenshot-N[-label].png (auto-increment).

import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const url   = process.argv[2] || 'http://localhost:3001';
const label = process.argv[3] || '';

const OUT_DIR = './temporary screenshots';
await mkdir(OUT_DIR, { recursive: true });

// next number
let n = 1;
if (existsSync(OUT_DIR)) {
  const files = await readdir(OUT_DIR);
  const nums = files.map(f => {
    const m = f.match(/^screenshot-(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  });
  n = (nums.length ? Math.max(...nums) : 0) + 1;
}
const name = label ? `screenshot-${n}-${label}.png` : `screenshot-${n}.png`;
const outPath = `${OUT_DIR}/${name}`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// scroll through the document so IntersectionObserver-driven reveals fire
await page.evaluate(async () => {
  const H = document.body.scrollHeight;
  const step = Math.max(300, Math.floor(window.innerHeight * 0.5));
  for (let y = 0; y <= H + window.innerHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 280));
  }
  // final pass: force all .reveal elements visible as a safety net
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 600));
});
// let fonts + reveal transitions settle
await new Promise(r => setTimeout(r, 1600));

const fullPage = process.env.VIEWPORT !== '1';
await page.screenshot({ path: outPath, fullPage });
await browser.close();

console.log('saved:', outPath);
