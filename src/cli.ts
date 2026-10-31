// diffgate CLI: the 2-second pre-merge gate for AI-assisted diffs.
//
//   diffgate check   [--base <ref>] [--format human|json|github] [--json out.json] [threshold flags]
//   diffgate measure [--base <ref>]
//
// `check` exits 0 on pass, 1 on fail. `measure` prints numbers only and always
// exits 0. No model, no account, no network -- everything is local.

import { writeFileSync } from 'node:fs';
import type { Format } from './report.js';
import { render } from './report.js';
import { getDiff, getFilesAt, langOf, resolveBase, revParse } from './git.js';
import { loadConfig, runGates } from './gates.js';
import { measureFunctions } from './complexity.js';
import { VERSION, type GateConfig } from './types.js';

interface GlobalOpts {
  base?: string;
  format: Format;
  jsonOut?: string;
  configPath?: string;
  cwd: string;
}

function parseArgs(argv: string[]): { cmd: string; opts: GlobalOpts; cfg: Partial<GateConfig> } {
  const opts: GlobalOpts = { format: 'human', cwd: process.cwd() };
  const cfg: Partial<GateConfig> = {};
  let cmd = '';
  const rest = argv.slice();
  if (rest.length > 0 && !(rest[0] as string).startsWith('-')) {
    cmd = rest.shift() as string;
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    const next = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`flag ${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--base':
        opts.base = next();
        break;
      case '--format': {
        const f = next();
        if (f !== 'human' && f !== 'json' && f !== 'github') {
          throw new Error(`--format must be human|json|github, got '${f}'`);
        }
        opts.format = f;
        break;
      }
      case '--json':
        opts.jsonOut = next();
        break;
      case '--config':
        opts.configPath = next();
        break;
      case '--max-complexity':
        cfg.maxComplexity = parseInt(next(), 10);
        break;
      case '--max-delta':
        cfg.maxDelta = parseInt(next(), 10);
        break;
      case '--min-dupe-tokens':
        cfg.minDupeTokens = parseInt(next(), 10);
        break;
      case '--max-dupe-blocks':
        cfg.maxDupeBlocks = parseInt(next(), 10);
        break;
      case '--max-file-growth':
        cfg.maxFileGrowth = parseInt(next(), 10);
        break;
      case '-h':
      case '--help':
        cmd = 'help';
        break;
      case '-v':
      case '--version':
        cmd = 'version';
        break;
      default:
        throw new Error(`unknown flag '${a}' (see --help)`);
    }
  }
  for (const k of Object.keys(cfg) as (keyof GateConfig)[]) {
    const v = cfg[k];
    if (!Number.isInteger(v) || (v as number) < 0) {
      throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} must be a non-negative integer`);
    }
  }
  return { cmd, opts, cfg };
}

const HELP = `diffgate ${VERSION} -- the 2-second pre-merge gate for AI-assisted diffs.

Usage:
  diffgate check   [--base <ref>] [--format human|json|github] [--json out.json]
                   [--max-complexity N] [--max-delta N] [--min-dupe-tokens N]
                   [--max-dupe-blocks N] [--max-file-growth N] [--config path]
  diffgate measure [--base <ref>]

Commands:
  check     Gate the diff: exit 0 on pass, 1 on fail.
  measure   Print per-function complexity numbers only; always exits 0.
  --help    Show this help.   --version  Show the version.

Base resolution: --base wins; otherwise the merge-base with origin/main
(or main/master); otherwise HEAD~1.

Thresholds (defaults): max-complexity 10, max-delta 15, min-dupe-tokens 50,
max-dupe-blocks 0, max-file-growth 500. A diffgate.json in the repo root sets
the same keys; flags override it.

What it checks (changed code only):
  complexity  touched function above max-complexity
  delta       touched function gaining more than max-delta complexity at once
  dupe        normalized token block of min-dupe-tokens+ repeated in the diff
  growth      single file gaining more than max-file-growth lines

Method: token-based cyclomatic approximation (lizard-class) -- branch
keywords/operators per function. A heuristic, not a semantic analysis.
Structural gates do not prove correctness.`;

function runCheck(opts: GlobalOpts, flagCfg: Partial<GateConfig>): number {
  const base = resolveBase(opts.base, opts.cwd);
  const head = revParse('HEAD', opts.cwd);
  const config = { ...loadConfig(opts.cwd, opts.configPath), ...flagCfg };
  const { violations, filesChecked, functionsChecked } = runGates({
    cwd: opts.cwd,
    base,
    config,
  });
  const out = render(opts.format, violations, base, head, filesChecked, functionsChecked);
  process.stdout.write(out + '\n');
  if (opts.jsonOut) {
    const json = render('json', violations, base, head, filesChecked, functionsChecked);
    writeFileSync(opts.jsonOut, json + '\n');
  }
  return violations.length === 0 ? 0 : 1;
}

function runMeasure(opts: GlobalOpts): number {
  const base = resolveBase(opts.base, opts.cwd);
  const head = revParse('HEAD', opts.cwd);
  const diffs = getDiff(base, opts.cwd);
  const lines: string[] = [`diffgate ${VERSION} measure -- base ${base} .. ${head}`, ''];
  const codeDiffs = diffs.filter((f) => langOf(f.path));
  const contents = getFilesAt('HEAD', codeDiffs.map((f) => f.path), opts.cwd);
  for (const file of codeDiffs) {
    const lang = langOf(file.path) as 'js' | 'py' | 'go';
    const src = contents.get(file.path) ?? null;
    if (src === null) continue;
    const funcs = measureFunctions(src, lang);
    if (funcs.length === 0) continue;
    lines.push(file.path);
    for (const f of funcs) {
      lines.push(`  ${f.name}:${f.startLine}  complexity ${f.complexity}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
  return 0;
}

export function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`diffgate: ${(err as Error).message}\n`);
    return 2;
  }
  const { cmd, opts, cfg } = parsed;
  try {
    switch (cmd) {
      case 'check':
        return runCheck(opts, cfg);
      case 'measure':
        return runMeasure(opts);
      case 'version':
        process.stdout.write(`diffgate ${VERSION}\n`);
        return 0;
      case 'help':
      case '':
        process.stdout.write(HELP + '\n');
        return 0;
      default:
        process.stderr.write(`diffgate: unknown command '${cmd}' (see --help)\n`);
        return 2;
    }
  } catch (err) {
    process.stderr.write(`diffgate: ${(err as Error).message}\n`);
    return 2;
  }
}

// Entry point when run as a CLI (not when imported by tests).
declare const require: { main?: object } | undefined;
declare const module: { exports: unknown } | undefined;
if (typeof require !== 'undefined' && require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
