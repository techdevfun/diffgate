// Reporters: human table, JSON manifest, GitHub Actions annotations.

import type { Violation } from './types.js';
import { VERSION } from './types.js';

export type Format = 'human' | 'json' | 'github';

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export function renderHuman(
  violations: Violation[],
  base: string,
  head: string,
  filesChecked: number,
  functionsChecked: number
): string {
  const lines: string[] = [];
  lines.push(`diffgate ${VERSION} -- base ${base} .. ${head}`);
  lines.push(`checked ${filesChecked} file(s), ${functionsChecked} touched function(s)`);
  lines.push('');
  if (violations.length === 0) {
    lines.push('PASS: all gates green.');
    return lines.join('\n');
  }
  lines.push('FAIL: ' + violations.length + ' violation(s)');
  lines.push('');
  const gateW = Math.max(4, ...violations.map((v) => v.gate.length));
  const locW = Math.max(8, ...violations.map((v) => `${v.file}:${v.line}`.length));
  lines.push(`${pad('GATE', gateW)}  ${pad('LOCATION', locW)}  MESSAGE`);
  lines.push(`${'-'.repeat(gateW)}  ${'-'.repeat(locW)}  ${'-'.repeat(40)}`);
  for (const v of violations) {
    lines.push(`${pad(v.gate, gateW)}  ${pad(`${v.file}:${v.line}`, locW)}  ${v.message}`);
  }
  return lines.join('\n');
}

export interface JsonManifest {
  tool: string;
  version: string;
  base: string;
  head: string;
  filesChecked: number;
  functionsChecked: number;
  result: 'pass' | 'fail';
  violations: Violation[];
}

export function renderJson(
  violations: Violation[],
  base: string,
  head: string,
  filesChecked: number,
  functionsChecked: number
): string {
  const manifest: JsonManifest = {
    tool: 'diffgate',
    version: VERSION,
    base,
    head,
    filesChecked,
    functionsChecked,
    result: violations.length === 0 ? 'pass' : 'fail',
    violations,
  };
  return JSON.stringify(manifest, null, 2);
}

function escapeAnnotation(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export function renderGithub(violations: Violation[]): string {
  const lines: string[] = [];
  for (const v of violations) {
    lines.push(
      `::error file=${v.file},line=${v.line}::[diffgate/${v.gate}] ${escapeAnnotation(v.message)}`
    );
  }
  if (violations.length === 0) {
    lines.push('::notice::[diffgate] all gates green');
  } else {
    lines.push(`::notice::[diffgate] ${violations.length} violation(s) found`);
  }
  return lines.join('\n');
}

export function render(
  format: Format,
  violations: Violation[],
  base: string,
  head: string,
  filesChecked: number,
  functionsChecked: number
): string {
  switch (format) {
    case 'json':
      return renderJson(violations, base, head, filesChecked, functionsChecked);
    case 'github':
      return renderGithub(violations);
    default:
      return renderHuman(violations, base, head, filesChecked, functionsChecked);
  }
}
