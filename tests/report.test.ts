import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHuman, renderJson, renderGithub } from '../src/report.js';
import type { Violation } from '../src/types.js';

const V: Violation[] = [
  {
    gate: 'complexity',
    file: 'app.ts',
    line: 42,
    message: "function 'f' complexity 11 exceeds max 10",
  },
];

describe('report', () => {
  it('emits exact GitHub annotation format', () => {
    const out = renderGithub(V);
    const lines = out.split('\n');
    assert.equal(
      lines[0],
      "::error file=app.ts,line=42::[diffgate/complexity] function 'f' complexity 11 exceeds max 10"
    );
  });

  it('escapes newlines in annotations', () => {
    const out = renderGithub([{ ...V[0] as Violation, message: 'a\nb\rc%d' }]);
    assert.ok(out.includes('a%0Ab%0Dc%25d'));
  });

  it('emits a notice when green', () => {
    assert.ok(renderGithub([]).includes('::notice::[diffgate] all gates green'));
  });

  it('human report shows PASS on empty and FAIL with table otherwise', () => {
    assert.ok(renderHuman([], 'abc', 'def', 1, 2).includes('PASS'));
    const fail = renderHuman(V, 'abc', 'def', 1, 2);
    assert.ok(fail.includes('FAIL'));
    assert.ok(fail.includes('app.ts:42'));
  });

  it('json manifest carries result and violations', () => {
    const m = JSON.parse(renderJson(V, 'abc', 'def', 1, 2)) as {
      tool: string;
      result: string;
      violations: Violation[];
    };
    assert.equal(m.tool, 'diffgate');
    assert.equal(m.result, 'fail');
    assert.equal(m.violations.length, 1);
    const ok = JSON.parse(renderJson([], 'abc', 'def', 1, 2)) as { result: string };
    assert.equal(ok.result, 'pass');
  });
});
