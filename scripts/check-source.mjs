import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const skippedDirectories = new Set(['.git', '.playwright-cli', 'node_modules', 'output', 'data', 'dist']);
async function repositoryFiles(directory = '.') {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(directory, entry.name).replace(/^\.\//, '');
    if (entry.isDirectory() && !skippedDirectories.has(entry.name)) paths.push(...await repositoryFiles(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}
const files = (await repositoryFiles()).sort();
const sourceFiles = files.filter((file) => /\.(?:js|mjs)$/.test(file));
await Promise.all(sourceFiles.map((file) => exec(process.execPath, ['--check', file])));
const forbidden = /\b(?:TODO|FIXME|HACK|XXX)\b|sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}/;
const violations = [];
for (const file of files.filter((value) => value !== 'scripts/check-source.mjs' && !/\.(?:png|jpg|jpeg|webp|ico)$/.test(value))) {
  const text = await readFile(file, 'utf8');
  if (forbidden.test(text)) violations.push(file);
}
if (violations.length) throw new Error(`Forbidden scaffolding or credential-like text in: ${violations.join(', ')}`);
console.log(`Checked ${sourceFiles.length} JavaScript files and ${files.length} repository files.`);
