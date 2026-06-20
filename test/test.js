'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyLicense, extractLicense, summarize, matchesDeny, parseArgs, scan } = require('../bin/licsweep.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  catch (e) { console.error('  \x1b[31m✗\x1b[0m ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

test('classifyLicense buckets the common cases', () => {
  assert.strictEqual(classifyLicense('MIT'), 'permissive');
  assert.strictEqual(classifyLicense('Apache-2.0'), 'permissive');
  assert.strictEqual(classifyLicense('GPL-3.0'), 'copyleft');
  assert.strictEqual(classifyLicense('AGPL-3.0-only'), 'copyleft');
  assert.strictEqual(classifyLicense('LGPL-2.1'), 'weak-copyleft');
  assert.strictEqual(classifyLicense('MPL-2.0'), 'weak-copyleft');
  assert.strictEqual(classifyLicense('UNKNOWN'), 'unknown');
  assert.strictEqual(classifyLicense(undefined), 'unknown');
});

test('classifyLicense picks most permissive in an OR expression', () => {
  assert.strictEqual(classifyLicense('(GPL-3.0 OR MIT)'), 'permissive');
  assert.strictEqual(classifyLicense('(LGPL-2.1 OR GPL-3.0)'), 'weak-copyleft');
});

test('extractLicense handles string / object / array forms', () => {
  assert.strictEqual(extractLicense({ license: 'MIT' }), 'MIT');
  assert.strictEqual(extractLicense({ license: { type: 'BSD-3-Clause' } }), 'BSD-3-Clause');
  assert.strictEqual(extractLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }), 'MIT OR Apache-2.0');
  assert.strictEqual(extractLicense({}), 'UNKNOWN');
});

test('matchesDeny matches category and glob', () => {
  const gpl = { name: 'x', license: 'GPL-3.0', category: 'copyleft' };
  assert.ok(matchesDeny(gpl, ['copyleft']));
  assert.ok(matchesDeny(gpl, ['GPL*']));
  assert.ok(!matchesDeny(gpl, ['MIT']));
  assert.ok(matchesDeny({ name: 'y', license: 'AGPL-3.0', category: 'copyleft' }, ['AGPL-3.0']));
});

test('summarize counts categories', () => {
  const recs = [
    { license: 'MIT', category: 'permissive' },
    { license: 'MIT', category: 'permissive' },
    { license: 'GPL-3.0', category: 'copyleft' },
  ];
  const s = summarize(recs);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.by.permissive, 2);
  assert.strictEqual(s.by.copyleft, 1);
  assert.strictEqual(s.byLicense.MIT, 2);
});

test('parseArgs --check defaults deny to copyleft+unknown', () => {
  const o = parseArgs(['--check']);
  assert.deepStrictEqual(o.deny, ['copyleft', 'unknown']);
  const o2 = parseArgs(['--deny', 'GPL*,AGPL*']);
  assert.deepStrictEqual(o2.deny, ['GPL*', 'AGPL*']);
});

test('scan reads a fake node_modules tree incl. scopes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'licsweep-'));
  const mk = (p, pkg) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(pkg));
  };
  mk(path.join(tmp, 'node_modules', 'a', 'package.json'), { name: 'a', version: '1.0.0', license: 'MIT' });
  mk(path.join(tmp, 'node_modules', '@scope', 'b', 'package.json'), { name: '@scope/b', version: '2.0.0', license: 'GPL-3.0' });
  const recs = scan(tmp);
  assert.strictEqual(recs.length, 2);
  assert.ok(recs.find((r) => r.name === '@scope/b' && r.category === 'copyleft'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

console.log(`\n  ${passed} passed\n`);
