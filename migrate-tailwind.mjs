/**
 * migrate-tailwind.mjs
 * For each HTML file:
 *   1. Remove <script src="cdn.tailwindcss.com">
 *   2. Remove the <script>tailwind.config = {...};</script> block
 *   3. Insert <link rel="stylesheet" href="/tailwind.css"> immediately before <style>
 *
 * Run: node migrate-tailwind.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';

const FILES = [
  'index.html',
  'pricing/index.html',
  'privacy-policy/index.html',
  'refund-policy/index.html',
  'terms-of-service/index.html',
  'book/index.html',
  'book/showroom/index.html',
  'book/quick-studz/index.html',
  'book/full-studz/index.html',
  'book/essentials-studz/index.html',
];

const CDN_LINE = '<script src="https://cdn.tailwindcss.com"></script>';
const LINK_TAG  = '<link rel="stylesheet" href="/tailwind.css">';

for (const file of FILES) {
  let src = await readFile(file, 'utf8');

  // 1. Remove the CDN <script> line (and its trailing newline)
  src = src.replace(CDN_LINE + '\n', '');

  // 2. Remove the tailwind.config <script> block.
  //    Pattern: <script>\ntailwind.config = { ... };\n</script>
  //    Followed optionally by a blank line.
  src = src.replace(/<script>\ntailwind\.config = \{[\s\S]*?\};\n<\/script>\n?/m, '');

  // 3. Insert the <link> tag immediately before the <style> block.
  //    After the removals above there may be one blank line before <style>.
  src = src.replace(/\n(<style>)/, `\n${LINK_TAG}\n$1`);

  await writeFile(file, src, 'utf8');
  console.log(`✓ ${file}`);
}

console.log('\nDone. Verify each page renders correctly before committing.');
