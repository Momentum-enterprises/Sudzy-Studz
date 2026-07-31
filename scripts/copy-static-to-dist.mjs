import { cp, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');

const directoriesToCopy = [
  'book',
  'pricing',
  'privacy-policy',
  'refund-policy',
  'terms-of-service',
  'brand_assets',
];

const filesToCopy = [
  'donation.json',
];

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyIntoDist(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const destination = path.join(distDir, relativePath);

  if (!(await exists(source))) {
    console.warn(`[copy-static-to-dist] Skipping missing path: ${relativePath}`);
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
  console.log(`[copy-static-to-dist] Copied ${relativePath}`);
}

async function main() {
  for (const directory of directoriesToCopy) {
    await copyIntoDist(directory);
  }

  for (const file of filesToCopy) {
    await copyIntoDist(file);
  }
}

main().catch((error) => {
  console.error('[copy-static-to-dist] Failed:', error);
  process.exitCode = 1;
});
