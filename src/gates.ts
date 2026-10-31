// Gate evaluation: run the four quality gates over a parsed diff.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GateConfig, Lang, Violation } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { getDiff, getFilesAt, langOf, type FileDiff } from './git.js';
import { measureFunctions } from './complexity.js';
import { findDupeBlocks, type DupeInput } from './dupe.js';

export interface GateInput {
  cwd: string;
  base: string;
  config: GateConfig;
}

export interface GateOutput {
  violations: Violation[];
  filesChecked: number;
  functionsChecked: number;
}

function touchedFunctions(
  file: FileDiff,
  lang: Lang,
  newSrc: string | null,
  oldSrc: string | null
): { name: string; startLine: number; endLine: number; complexity: number; delta: number }[] {
  if (newSrc === null) return [];
  const oldByName = new Map(
    measureFunctions(oldSrc ?? '', lang).map((f) => [f.name, f.complexity])
  );
  const newFuncs = measureFunctions(newSrc, lang);
  const addedLines = new Set(file.added.map((a) => a.line));
  const out: {
    name: string;
    startLine: number;
    endLine: number;
    complexity: number;
    delta: number;
  }[] = [];
  for (const f of newFuncs) {
    let touched = false;
    for (let l = f.startLine; l <= f.endLine; l++) {
      if (addedLines.has(l)) {
        touched = true;
        break;
      }
    }
    if (!touched) continue;
    out.push({
      name: f.name,
      startLine: f.startLine,
      endLine: f.endLine,
      complexity: f.complexity,
      delta: f.complexity - (oldByName.get(f.name) ?? 0),
    });
  }
  return out;
}

export function runGates(input: GateInput): GateOutput {
  const { cwd, base, config } = input;
  const diffs = getDiff(base, cwd);
  const violations: Violation[] = [];
  let functionsChecked = 0;
  const dupeInputs: DupeInput[] = [];

  // batch-read every changed file at both refs: one git process per ref
  const codePaths = diffs.filter((f) => langOf(f.path)).map((f) => f.path);
  const newFiles = getFilesAt('HEAD', codePaths, cwd);
  const oldFiles = getFilesAt(base, codePaths, cwd);

  for (const file of diffs) {
    const lang = langOf(file.path);
    if (lang) {
      dupeInputs.push({
        path: file.path,
        lines: file.added.map((a) => ({ line: a.line, text: a.text })),
        lang,
      });
      for (const fn of touchedFunctions(
        file,
        lang,
        newFiles.get(file.path) ?? null,
        oldFiles.get(file.path) ?? null
      )) {
        functionsChecked++;
        if (fn.complexity > config.maxComplexity) {
          violations.push({
            gate: 'complexity',
            file: file.path,
            line: fn.startLine,
            message: `function '${fn.name}' complexity ${fn.complexity} exceeds max ${config.maxComplexity}`,
          });
        }
        if (fn.delta > config.maxDelta) {
          violations.push({
            gate: 'delta',
            file: file.path,
            line: fn.startLine,
            message: `function '${fn.name}' gained +${fn.delta} complexity in one diff (budget ${config.maxDelta})`,
          });
        }
      }
    }
    if (file.addedCount > config.maxFileGrowth) {
      const firstLine = file.added.length > 0 ? (file.added[0] as { line: number }).line : 1;
      violations.push({
        gate: 'growth',
        file: file.path,
        line: firstLine,
        message: `file grew by +${file.addedCount} lines in one diff (limit ${config.maxFileGrowth}); split this change`,
      });
    }
  }

  const blocks = findDupeBlocks(dupeInputs, config.minDupeTokens);
  const reported = blocks.slice(0, 25);
  for (const b of reported) {
    violations.push({
      gate: 'dupe',
      file: b.fileB,
      line: b.lineB,
      message: `duplicated block of ${b.tokens} tokens also at ${b.fileA}:${b.lineA}`,
    });
  }

  return { violations, filesChecked: diffs.length, functionsChecked };
}

export function loadConfig(cwd: string, explicitPath?: string): GateConfig {
  const cfg: GateConfig = { ...DEFAULT_CONFIG };
  const path = explicitPath ?? join(cwd, 'diffgate.json');
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<GateConfig>;
      for (const key of Object.keys(cfg) as (keyof GateConfig)[]) {
        const v = raw[key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          (cfg[key] as number) = v;
        }
      }
    } catch {
      // malformed config: keep defaults rather than failing the run
    }
  }
  return cfg;
}
