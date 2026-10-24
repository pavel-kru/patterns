#!/usr/bin/env node
// Commit-time check of the pattern contract, run by .githooks/pre-commit for every
// commit, whichever session or terminal makes it:
// - front-matter with `sources`, `verified`, `status` and `worth` (why the pattern
//   earns its place: the trap or cost it saves, and the evidence);
// - a row in the README index;
// - evidence labels in the body, and at least one (verified) claim when proven.
//
//   node scripts/check-patterns.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const problems = [];

const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.cache', 'node_modules', 'templates', 'skills'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.md')) check(path);
  }
};

const check = path => {
  const text = readFileSync(path, 'utf8');
  const header = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  // Only files with a `verified:` front-matter are patterns (README, CLAUDE.md are not).
  if (!header || !/^verified:/m.test(header)) return;
  const file = relative(root, path);
  const body = text.slice(text.indexOf('\n---', 3) + 4);
  const field = name => header.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1]?.trim();
  const fail = message => problems.push(`${file}: ${message}`);

  if (field('sources') === undefined) fail('no `sources:` (use `sources: []` for a practice-only pattern)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(field('verified') ?? '')) fail('`verified:` is not a YYYY-MM-DD date');
  const status = field('status');
  if (!['proven', 'candidate'].includes(status)) fail('`status:` must be proven or candidate');
  const worth = field('worth') ?? '';
  if (worth.length < 40 || /\b(TODO|TBD)\b/i.test(worth)) {
    fail('`worth:` must say in one line why the pattern earns its place: the trap or cost it saves, and the evidence');
  }
  if (!readme.includes(`\`${file}\``)) fail('not listed in the README index');
  if (!/\((verified|docs|opinion)\b/.test(body)) fail('no evidence labels: mark claims (verified: how), (docs) or (opinion)');
  if (status === 'proven' && !/\(verified\b/.test(body)) fail('`proven` needs at least one (verified) claim');
};

walk(root);
for (const [, file] of readme.matchAll(/^\| `([^`]+\.md)` \|/gm)) {
  try {
    readFileSync(join(root, file));
  } catch {
    problems.push(`README.md: the index lists ${file}, which does not exist`);
  }
}
if (problems.length) {
  console.error(`Pattern contract (scripts/check-patterns.mjs):\n${problems.map(p => `- ${p}`).join('\n')}`);
  process.exit(1);
}
