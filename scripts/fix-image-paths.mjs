/**
 * fix-image-paths.mjs
 * Nahradí absolutní WordPress URL obrázků relativními cestami v MD souborech.
 * Použití: node scripts/fix-image-paths.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src/content');

const WP_UPLOADS_PATTERNS = [
  /https?:\/\/petrmzicek\.cz\/wp-content\/uploads\//g,
  /https?:\/\/www\.petrmzicek\.cz\/wp-content\/uploads\//g,
  /https?:\/\/[^/]+\/wp-content\/uploads\//g,
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  for (const pattern of WP_UPLOADS_PATTERNS) {
    if (pattern.test(content)) {
      content = content.replace(pattern, '/images/');
      changed = true;
    }
    pattern.lastIndex = 0; // reset regex state
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  return false;
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(full);
    }
  }
  return files;
}

const files = walkDir(CONTENT_DIR);
let fixed = 0;

for (const file of files) {
  if (processFile(file)) {
    console.log(`✅ ${path.relative(ROOT, file)}`);
    fixed++;
  }
}

console.log(`\nHotovo: ${fixed} souborů upraveno z ${files.length} celkem.`);
