#!/usr/bin/env node
/**
 * SC-008: статический аудит «route → service → ORM».
 * Маршруты (backend/src/routes/**) MUST NOT импортировать Prisma напрямую
 * и MUST NOT обращаться к prisma.*.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROUTES_DIR = path.resolve(process.cwd(), 'src/routes');
const VIOLATIONS = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) audit(full);
  }
}

function audit(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/from\s+['"][^'"]*@prisma[^'"]*['"]/.test(line)) VIOLATIONS.push(`${file}:${i + 1} → import '@prisma/*'`);
    if (/from\s+['"]\.\.\/\.\.\/db\.js['"]/.test(line) || /from\s+['"]\.\.\/db\.js['"]/.test(line) || /from\s+['"]\.\/db\.js['"]/.test(line)) {
      VIOLATIONS.push(`${file}:${i + 1} → import '.../db.js' (Prisma client)`);
    }
    if (/prisma\./.test(line) && !/prisma-friendly|prisma\.schema/.test(line)) {
      VIOLATIONS.push(`${file}:${i + 1} → "prisma." usage`);
    }
  }
}

function main() {
  if (!fs.existsSync(ROUTES_DIR)) {
    console.error('[judge:route-audit] src/routes not found, run from backend/');
    process.exit(1);
  }
  walk(ROUTES_DIR);
  if (VIOLATIONS.length) {
    console.error('[judge:route-audit] FAIL — direct Prisma access in routes:');
    for (const v of VIOLATIONS) console.error('  ' + v);
    process.exit(1);
  }
  console.log('[judge:route-audit] OK — no direct Prisma access in routes');
}

main();
