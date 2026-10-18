import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import process from 'node:process';

const allowed = new Set(['.ts', '.json', '.md', '.yml']);
const excluded = new Set(['node_modules', '.git', 'coverage']);
const targets: string[] = [];

function walk(folder: string): void {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    if (excluded.has(item.name)) continue;
    const filename = join(folder, item.name);
    if (item.isDirectory()) walk(filename);
    else if (item.isFile() && allowed.has(extname(item.name))) targets.push(filename);
  }
}

function normalize(input: string): string {
  return input.replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n*$/, '\n');
}

const write = process.argv.includes('--write');
if (!write && !process.argv.includes('--check')) {
  console.error('Usage: node scripts/style.ts --check|--write');
  process.exitCode = 2;
} else {
  walk('.');
  let violations = 0;
  for (const file of targets) {
    const original = readFileSync(file, 'utf8');
    const fixed = normalize(original);
    if (original === fixed) continue;
    if (write) writeFileSync(file, fixed);
    else {
      console.error('Formatting required:', file);
      violations++;
    }
  }
  if (violations) process.exitCode = 1;
  else console.log(write ? 'Whitespace formatting applied.' : 'Whitespace formatting passed.');
}
