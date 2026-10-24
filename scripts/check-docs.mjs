#!/usr/bin/env node
// Session-start check: have the docs the patterns cite changed since they were
// verified, or is Claude Code newer than the version they were checked on?
// Prints a report only when there is something to do, so it costs no context
// otherwise.
//
//   node scripts/check-docs.mjs                check (at most once a day)
//   node scripts/check-docs.mjs --force        check now
//   node scripts/check-docs.mjs --update-lock  record pages as verified: new pages
//       always; a changed page only when every pattern citing it was re-verified
//       today (its `verified:` date is today), otherwise it is refused (exit 1)
//
// Each recorded page is also kept as a local snapshot in .cache/docs/ (not in
// git: the pages are third-party docs). When a page changes, the report points
// at a diff of the verified version against the current one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'docs.lock.json');
const cachePath = join(root, '.cache', 'docs-check.json');
const snapshotDir = join(root, '.cache', 'docs');
const args = new Set(process.argv.slice(2));
const DAY_MS = 24 * 60 * 60 * 1000;

const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

const lock = readJson(lockPath, { pages: {} });
const cache = readJson(cachePath, {});

if (
  !args.has('--force') &&
  !args.has('--update-lock') &&
  cache.checkedAt &&
  Date.now() - Date.parse(cache.checkedAt) < DAY_MS
) {
  process.exit(0);
}

// Patterns are the .md files with front-matter; templates are skipped.
const patterns = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.cache', 'node_modules', 'templates'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith('.md')) {
      const header = readFileSync(path, 'utf8').match(/^---\n([\s\S]*?)\n---/);
      if (!header) continue;
      const sources = [...header[1].matchAll(/^\s+-\s+(https?:\/\/\S+)/gm)].map(m => m[1]);
      const claudeCode = header[1].match(/^claude_code:\s*([\d.]+)/m)?.[1];
      const verified = header[1].match(/^verified:\s*(\d{4}-\d{2}-\d{2})/m)?.[1];
      patterns.push({ file: relative(root, path), sources, claudeCode, verified });
    }
  }
};
walk(root);

const sha = text => createHash('sha256').update(text).digest('hex');
const snapshot = (url, suffix = '') => join(snapshotDir, `${sha(url).slice(0, 16)}${suffix}.md`);
const saveSnapshot = (url, text, suffix = '') => {
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshot(url, suffix), text);
};

const urls = [...new Set(patterns.flatMap(p => p.sources))];
const fetched = await Promise.all(
  urls.map(async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return { url, error: `HTTP ${response.status}` };
      const text = await response.text();
      return { url, text, sha256: sha(text) };
    } catch (error) {
      return { url, error: error.name };
    }
  }),
);
const reached = fetched.filter(page => page.sha256);
const unreachable = fetched.filter(page => page.error);
const citing = url => patterns.filter(p => p.sources.includes(url));
const citedBy = url => citing(url).map(p => p.file).join(', ');

// The verified version of an unchanged page is the one just fetched: keep a snapshot.
for (const { url, text, sha256 } of reached) {
  if (lock.pages[url]?.sha256 === sha256 && !existsSync(snapshot(url))) saveSnapshot(url, text);
}

if (args.has('--update-lock')) {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Pages no longer cited are dropped; pages not reached this time keep their entry.
  const pages = Object.fromEntries(Object.entries(lock.pages).filter(([url]) => urls.includes(url)));
  const added = [];
  const refreshed = [];
  const refused = [];
  for (const { url, text, sha256 } of reached) {
    if (pages[url]?.sha256 === sha256) continue;
    const stale = citing(url).filter(p => p.verified !== today).map(p => p.file);
    if (pages[url] && stale.length) {
      refused.push(`- ${url}\n    re-verify first (verified date is not today): ${stale.join(', ')}`);
      continue;
    }
    (pages[url] ? refreshed : added).push(url);
    pages[url] = { sha256 };
    saveSnapshot(url, text);
  }
  writeFileSync(lockPath, `${JSON.stringify({ pages }, null, 2)}\n`);
  console.log(`docs.lock.json: ${added.length} new, ${refreshed.length} re-verified, ${refused.length} refused.`);
  for (const { url, error } of unreachable) console.log(`  not reached: ${url} (${error})`);
  if (refused.length) {
    console.log(`Not recorded, the docs changed but the patterns citing them were not re-verified today:\n${refused.join('\n')}`);
    process.exit(1);
  }
  process.exit(0);
}

if (!reached.length && urls.length) {
  console.log(
    'Docs check skipped: could not reach the cited docs. Treat the patterns in this repo as unverified this session.',
  );
  process.exit(0);
}

mkdirSync(dirname(cachePath), { recursive: true });
writeFileSync(cachePath, `${JSON.stringify({ checkedAt: new Date().toISOString() })}\n`);

const changed = reached.filter(({ url, sha256 }) => lock.pages[url] && lock.pages[url].sha256 !== sha256);
const unrecorded = reached.filter(({ url }) => !lock.pages[url]);

const toParts = version => version.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [toParts(a), toParts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
};
const recorded = patterns.map(p => p.claudeCode).filter(Boolean).sort((a, b) => (newer(a, b) ? -1 : 1))[0];
let installed;
try {
  installed = execFileSync('claude', ['--version'], { timeout: 3000, encoding: 'utf8' }).match(/\d+\.\d+\.\d+/)?.[0];
} catch {
  installed = undefined;
}

const lines = [];
if (changed.length) {
  lines.push('Cited docs changed since the patterns citing them were verified:');
  for (const { url, text } of changed) {
    lines.push(`- ${url} (cited by ${citedBy(url)})`);
    saveSnapshot(url, text, '.new');
    lines.push(
      existsSync(snapshot(url))
        ? `    what changed: git diff --no-index --word-diff ${snapshot(url)} ${snapshot(url, '.new')}`
        : '    no snapshot of the verified version: re-check every claim that cites it',
    );
  }
}
if (unrecorded.length) {
  lines.push('Cited docs never recorded as verified:');
  for (const { url } of unrecorded) lines.push(`- ${url} (cited by ${citedBy(url)})`);
}
if (installed && recorded && newer(installed, recorded)) {
  lines.push(`Claude Code is ${installed}; the patterns were last verified on ${recorded}.`);
}
if (lines.length) {
  if (unreachable.length) lines.push(`Not reached this time: ${unreachable.map(p => p.url).join(', ')}`);
  lines.push('Follow "Keeping the patterns current" in CLAUDE.md before relying on the affected patterns.');
  console.log(lines.join('\n'));
}
