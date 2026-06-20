# licsweep

[![npm](https://img.shields.io/npm/v/@bobfromarcher/licsweep?color=cb3837&logo=npm)](https://www.npmjs.com/package/@bobfromarcher/licsweep)
[![CI](https://github.com/bobfromarcher/licsweep/actions/workflows/ci.yml/badge.svg)](https://github.com/bobfromarcher/licsweep/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@bobfromarcher/licsweep?color=blue)](LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-success)](package.json)

> One `GPL` dependency can legally oblige you to open-source your whole product. **licsweep** audits every license in your `node_modules`, buckets them by risk, and fails CI the moment a forbidden one sneaks in. **Zero dependencies. Zero AI.**

```
  ● licsweep  68 dependencies

    ✓ permissive     68
    ~ weak-copyleft  0
    ✗ copyleft       0
    ? unknown        0

  top licenses: MIT (63), ISC (4), BSD-3-Clause (1)
```

## Install

```bash
npm install -g @bobfromarcher/licsweep
# or once:
npx @bobfromarcher/licsweep
```

## Usage

```bash
licsweep [path] [options]
```

| Option | Description |
| --- | --- |
| `--check` | Exit `1` if any dependency matches `--deny` (CI gate) |
| `--deny <list>` | Comma-separated licenses/categories to forbid |
| `--flagged` | Show only weak-copyleft / copyleft / unknown packages |
| `--markdown`, `--md` | Markdown report |
| `--json` | Raw JSON |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

### Examples

```bash
licsweep                          # summary of every dependency's license
licsweep --flagged                # just the ones worth a second look
licsweep --check --deny copyleft  # fail CI if any viral copyleft slips in
licsweep --deny "GPL*,AGPL*"      # forbid specific SPDX ids (globs allowed)
licsweep --markdown > LICENSES.md
```

`--deny` accepts **categories** (`permissive`, `weak-copyleft`, `copyleft`,
`unknown`) and **license globs** (`GPL*`, `AGPL-3.0`). With `--check` and no
explicit list, it defaults to denying `copyleft,unknown`.

### Gate it in CI

```yaml
# .github/workflows/licenses.yml
- run: npx @bobfromarcher/licsweep --check --deny copyleft,unknown
```

## Risk buckets

| Bucket | Examples | Meaning |
| --- | --- | --- |
| **permissive** | MIT, ISC, BSD, Apache-2.0, 0BSD, CC0 | Safe to ship in closed source |
| **weak-copyleft** | LGPL, MPL-2.0, EPL, CDDL | File-/library-level obligations |
| **copyleft** | GPL, AGPL, SSPL, OSL, EUPL | Viral — can force you to open-source |
| **unknown** | missing / unrecognized | Investigate before shipping |

SPDX expressions like `(GPL-3.0 OR MIT)` are resolved to their **most
permissive** option, matching how you're actually allowed to use them.

## Development

```bash
git clone https://github.com/bobfromarcher/licsweep
cd licsweep
node test/test.js
```

CI runs the suite on Node 18/20/22 across Linux, macOS and Windows.

## License

MIT © bobfromarcher
