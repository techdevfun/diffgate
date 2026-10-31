import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runGates, loadConfig } from '../src/gates.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { makeRepo } from './helpers.js';

const SIMPLE_JS = (body: string): string =>
  `function target() {\n${body}\n}\n`;

describe('gates', () => {
  it('fails complexity when a touched function exceeds the max', () => {
    const big = Array.from({ length: 12 }, (_, i) => `  if (a${i}) { b(); }`).join('\n');
    const { dir, baseSha } = makeRepo(
      { 'f.js': SIMPLE_JS('  return 1;') },
      { 'f.js': SIMPLE_JS(big) }
    );
    const out = runGates({ cwd: dir, base: baseSha, config: { ...DEFAULT_CONFIG } });
    const v = out.violations.filter((x) => x.gate === 'complexity');
    assert.equal(v.length, 1);
    assert.equal(v[0]?.file, 'f.js');
  });

  it('fails delta when one diff adds too much complexity at once', () => {
    const big = Array.from({ length: 20 }, (_, i) => `  if (a${i}) { b(); }`).join('\n');
    const { dir, baseSha } = makeRepo(
      { 'f.js': SIMPLE_JS('  return 1;') },
      { 'f.js': SIMPLE_JS(big) }
    );
    const out = runGates({
      cwd: dir,
      base: baseSha,
      config: { ...DEFAULT_CONFIG, maxComplexity: 100 },
    });
    const v = out.violations.filter((x) => x.gate === 'delta');
    assert.equal(v.length, 1);
    assert.match(v[0]?.message ?? '', /\+20/);
  });

  it('fails growth when a single file grows past the limit', () => {
    const added = Array.from({ length: 501 }, (_, i) => `const v${i} = ${i};`).join('\n') + '\n';
    const { dir, baseSha } = makeRepo({ 'f.js': 'const a = 1;\n' }, { 'f.js': 'const a = 1;\n' + added });
    const out = runGates({ cwd: dir, base: baseSha, config: { ...DEFAULT_CONFIG } });
    const v = out.violations.filter((x) => x.gate === 'growth');
    assert.equal(v.length, 1);
    assert.match(v[0]?.message ?? '', /\+501/);
  });

  it('passes a clean diff', () => {
    const { dir, baseSha } = makeRepo(
      { 'f.js': SIMPLE_JS('  if (a) { return 1; }\n  return 0;') },
      { 'f.js': SIMPLE_JS('  if (a) { return 1; }\n  if (b) { return 2; }\n  return 0;') }
    );
    const out = runGates({ cwd: dir, base: baseSha, config: { ...DEFAULT_CONFIG } });
    assert.equal(out.violations.length, 0);
  });

  it('ignores pre-existing complexity that the diff does not touch', () => {
    const big = Array.from({ length: 30 }, (_, i) => `  if (a${i}) { b(); }`).join('\n');
    const { dir, baseSha } = makeRepo(
      { 'f.js': SIMPLE_JS(big) + 'function other() {\n  return 1;\n}\n' },
      { 'f.js': SIMPLE_JS(big) + 'function other() {\n  return 2;\n}\n' }
    );
    const out = runGates({ cwd: dir, base: baseSha, config: { ...DEFAULT_CONFIG } });
    // `other` is touched but simple; the complex function is untouched
    assert.equal(out.violations.length, 0);
  });

  it('loadConfig reads diffgate.json and ignores bad values', () => {
    const { dir } = makeRepo({ 'diffgate.json': '{"maxComplexity": 3, "maxDelta": "x"}' });
    const cfg = loadConfig(dir);
    assert.equal(cfg.maxComplexity, 3);
    assert.equal(cfg.maxDelta, DEFAULT_CONFIG.maxDelta);
  });
});
