#!/usr/bin/env node
'use strict';
/*
 * licsweep — audit the licenses of your installed npm dependencies.
 * Flags copyleft / unknown licenses and can fail CI on a deny-list.
 * Zero dependencies. Zero AI.
 */
const fs = require('fs');
const path = require('path');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const C = (c) => (s) => (useColor ? `\x1b[${c}m${s}\x1b[0m` : String(s));
const bold = C('1'), dim = C('2'), red = C('31'), green = C('32'), yellow = C('33'), cyan = C('36');

// Risk buckets. Copyleft = viral; weak-copyleft = file-level; unknown = investigate.
const COPYLEFT = [/^GPL/i, /^AGPL/i, /^EUPL/i, /^OSL/i, /^CPAL/i, /^SSPL/i];
const WEAK_COPYLEFT = [/^LGPL/i, /^MPL/i, /^EPL/i, /^CDDL/i, /^MS-RL/i];
const PERMISSIVE = [/^MIT/i, /^ISC/i, /^BSD/i, /^Apache/i, /^Unlicense/i, /^0BSD/i, /^CC0/i, /^WTFPL/i, /^BlueOak/i, /^Zlib/i, /^Python/i];

function classifyLicense(license) {
  if (!license || license === 'UNKNOWN') return 'unknown';
  const s = String(license).replace(/[()]/g, '');
  // SPDX expressions: "(MIT OR Apache-2.0)" -> classify by the most permissive option
  const parts = s.split(/\s+(?:OR|AND)\s+/i).map((p) => p.trim());
  let best = 'unknown';
  const rank = { permissive: 3, 'weak-copyleft': 2, copyleft: 1, unknown: 0 };
  for (const p of parts) {
    let cat = 'unknown';
    if (PERMISSIVE.some((re) => re.test(p))) cat = 'permissive';
    else if (WEAK_COPYLEFT.some((re) => re.test(p))) cat = 'weak-copyleft';
    else if (COPYLEFT.some((re) => re.test(p))) cat = 'copyleft';
    if (rank[cat] > rank[best]) best = cat;
  }
  return best;
}

function extractLicense(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length)
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).filter(Boolean).join(' OR ');
  return 'UNKNOWN';
}

// Walk node_modules (incl. @scope/*) collecting one record per package.
function scan(root) {
  const nm = path.join(root, 'node_modules');
  const out = [];
  if (!fs.existsSync(nm)) return out;
  const readPkg = (dir) => {
    const pj = path.join(dir, 'package.json');
    if (!fs.existsSync(pj)) return;
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { return; }
    if (!pkg.name) return;
    const license = extractLicense(pkg);
    out.push({ name: pkg.name, version: pkg.version || '0.0.0', license, category: classifyLicense(license) });
  };
  for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(nm, entry.name);
    if (entry.name.startsWith('@')) {
      for (const sub of fs.readdirSync(full, { withFileTypes: true }))
        if (sub.isDirectory()) readPkg(path.join(full, sub.name));
    } else if (entry.isDirectory()) {
      readPkg(full);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function summarize(records) {
  const by = { permissive: 0, 'weak-copyleft': 0, copyleft: 0, unknown: 0 };
  const byLicense = {};
  for (const r of records) {
    by[r.category]++;
    byLicense[r.license] = (byLicense[r.license] || 0) + 1;
  }
  return { total: records.length, by, byLicense };
}

function matchesDeny(record, denyList) {
  return denyList.some((d) => {
    if (d.toLowerCase() === record.category) return true;
    return new RegExp('^' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'), 'i').test(record.license);
  });
}

const CAT_COLOR = { permissive: green, 'weak-copyleft': yellow, copyleft: red, unknown: dim };
const CAT_MARK = { permissive: '✓', 'weak-copyleft': '~', copyleft: '✗', unknown: '?' };

const HELP = `
licsweep — audit the licenses of your installed npm dependencies.

Usage:
  licsweep [path] [options]

Options:
  --check           Exit 1 if any dependency matches --deny (CI gate)
  --deny <list>     Comma-separated licenses/categories to forbid
                    (e.g. "copyleft,unknown" or "GPL-3.0,AGPL*")
  --flagged         Only show weak-copyleft / copyleft / unknown packages
  --markdown, --md  Markdown report
  --json            Raw JSON
  -h, --help        Show help
  -v, --version     Show version

Examples:
  licsweep                          # summary of every dependency's license
  licsweep --flagged                # just the ones worth a second look
  licsweep --check --deny copyleft  # fail CI if any viral copyleft slips in
`;

function parseArgs(argv) {
  const o = { cwd: process.cwd(), check: false, deny: [], flagged: false, format: 'summary' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') o.check = true;
    else if (a === '--deny') o.deny = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--flagged') o.flagged = true;
    else if (a === '--markdown' || a === '--md') o.format = 'markdown';
    else if (a === '--json') o.format = 'json';
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-v' || a === '--version') o.version = true;
    else rest.push(a);
  }
  if (rest[0]) o.cwd = path.resolve(rest[0]);
  if (o.check && !o.deny.length) o.deny = ['copyleft', 'unknown'];
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP); return; }
  if (o.version) { process.stdout.write(require('../package.json').version + '\n'); return; }

  const records = scan(o.cwd);
  const sum = summarize(records);
  const denied = o.deny.length ? records.filter((r) => matchesDeny(r, o.deny)) : [];

  if (o.format === 'json') {
    process.stdout.write(JSON.stringify({ summary: sum, denied, packages: records }, null, 2) + '\n');
    if (o.check && denied.length) process.exit(1);
    return;
  }
  if (o.format === 'markdown') {
    const L = ['# Dependency licenses', '',
      `Total: **${sum.total}** · permissive ${sum.by.permissive} · weak-copyleft ${sum.by['weak-copyleft']} · copyleft ${sum.by.copyleft} · unknown ${sum.by.unknown}`,
      '', '| Package | Version | License | Category |', '| --- | --- | --- | --- |'];
    for (const r of records) L.push(`| \`${r.name}\` | ${r.version} | ${r.license} | ${r.category} |`);
    process.stdout.write(L.join('\n') + '\n');
    if (o.check && denied.length) process.exit(1);
    return;
  }

  // summary view
  process.stdout.write(`\n  ${bold(cyan('● licsweep'))}  ${dim(sum.total + ' dependencies')}\n\n`);
  if (!sum.total) {
    process.stdout.write(`  ${dim('no node_modules found — run `npm install` first')}\n\n`);
    return;
  }
  for (const cat of ['permissive', 'weak-copyleft', 'copyleft', 'unknown'])
    process.stdout.write(`    ${CAT_COLOR[cat](CAT_MARK[cat] + ' ' + cat.padEnd(14))} ${bold(sum.by[cat])}\n`);
  process.stdout.write('\n');

  const show = o.flagged ? records.filter((r) => r.category !== 'permissive') : records;
  if (o.flagged && !show.length) process.stdout.write(`  ${green('✓')} nothing flagged — all permissive\n`);
  for (const r of show) {
    const col = CAT_COLOR[r.category];
    process.stdout.write(`    ${col(CAT_MARK[r.category])} ${r.name.padEnd(34)} ${dim(r.license)}\n`);
  }
  process.stdout.write('\n  ' + dim('top licenses: ' +
    Object.entries(sum.byLicense).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([l, n]) => `${l} (${n})`).join(', ')) + '\n');

  if (o.deny.length) {
    if (denied.length) {
      process.stdout.write(`\n  ${red('✗ ' + denied.length + ' denied')} ${dim('(' + o.deny.join(', ') + ')')}: ${denied.map((r) => r.name).join(', ')}\n\n`);
      if (o.check) process.exit(1);
    } else {
      process.stdout.write(`\n  ${green('✓ none of the denied licenses are present')}\n\n`);
    }
  } else {
    process.stdout.write('\n');
  }
}

if (require.main === module) main();

module.exports = { classifyLicense, extractLicense, summarize, matchesDeny, parseArgs, scan };
