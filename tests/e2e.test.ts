import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git } from './helpers.js';

// tests run from the package root (npm test); fall back to the test dir
const PKG_ROOT =
  typeof __dirname !== 'undefined' ? join(__dirname, '..') : process.cwd();
const SAMPLE = join(PKG_ROOT, 'examples', 'sample-diff');
const CLI = join(PKG_ROOT, 'dist', 'cli.js');

function buildSampleRepo(): { dir: string; baseSha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'diffgate-e2e-'));
  const cleanup = (): void => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };
  try {
    git(dir, ['init', '-q']);
    git(dir, ['config', 'user.email', 'test@diffgate.dev']);
    git(dir, ['config', 'user.name', 'diffgate-test']);
    cpSync(join(SAMPLE, 'base'), dir, { recursive: true });
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    const baseSha = git(dir, ['rev-parse', 'HEAD']).trim();
    cpSync(join(SAMPLE, 'head'), dir, { recursive: true });
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'pr']);
    return { dir, baseSha };
  } catch (err) {
    cleanup();
    throw err;
  }
}

function runCli(dir: string, args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? 99, stdout: e.stdout ?? '' };
  }
}

describe('e2e: sample diff', () => {
  it('check fails with exactly the 3 expected violations', () => {
    const { dir, baseSha } = buildSampleRepo();
    try {
      const { code, stdout } = runCli(dir, ['check', '--base', baseSha, '--format', 'json']);
      assert.equal(code, 1, 'check must exit 1 on violations\n' + stdout);
      const manifest = JSON.parse(stdout) as {
        result: string;
        violations: { gate: string; file: string; line: number; message: string }[];
      };
      assert.equal(manifest.result, 'fail');
      assert.equal(manifest.violations.length, 3);
      const byGate = new Map(manifest.violations.map((v) => [v.gate, v]));
      assert.deepEqual(
        [...byGate.keys()].sort(),
        ['complexity', 'dupe', 'growth'],
        JSON.stringify(manifest.violations, null, 1)
      );
      const c = byGate.get('complexity') as { file: string; message: string };
      assert.ok(c.file.endsWith('checkout.py'));
      assert.match(c.message, /process_order/);
      assert.match(c.message, /complexity 13/);
      const d = byGate.get('dupe') as { file: string; message: string };
      assert.ok(d.file.endsWith('utils.go'));
      assert.match(d.message, /also at/);
      const g = byGate.get('growth') as { file: string; message: string };
      assert.ok(g.file.endsWith('routes.json'));
      assert.match(g.message, /\+622/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('measure prints numbers and exits 0', () => {
    const { dir, baseSha } = buildSampleRepo();
    try {
      const { code, stdout } = runCli(dir, ['measure', '--base', baseSha]);
      assert.equal(code, 0, stdout);
      assert.match(stdout, /process_order/);
      assert.match(stdout, /complexity 13/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('github format emits annotations', () => {
    const { dir, baseSha } = buildSampleRepo();
    try {
      const { code, stdout } = runCli(dir, ['check', '--base', baseSha, '--format', 'github']);
      assert.equal(code, 1);
      assert.match(stdout, /^::error file=.*checkout\.py,line=\d+::\[diffgate\/complexity\]/m);
      assert.match(stdout, /^::error file=.*utils\.go,line=\d+::\[diffgate\/dupe\]/m);
      assert.match(stdout, /^::error file=.*routes\.json,line=\d+::\[diffgate\/growth\]/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
