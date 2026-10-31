import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDupeBlocks } from '../src/dupe.js';

const BLOCK = [
  'for attempt in range(3):',
  '    resp = client.get(url)',
  '    if resp.ok:',
  '        return resp.data',
  '    sleep(backoff * attempt)',
].join('\n');

function inputWith(copies: number, filler: string[]): { path: string; lines: { line: number; text: string }[]; lang: 'py' } {
  const texts: string[] = [];
  for (let c = 0; c < copies; c++) {
    texts.push(...filler, ...BLOCK.split('\n').map((l) => l.replace(/attempt/g, `a${c}`)));
  }
  return {
    path: 'a.py',
    lines: texts.map((text, i) => ({ line: i + 1, text })),
    lang: 'py',
  };
}

describe('dupe', () => {
  it('finds a planted clone despite renamed identifiers', () => {
    const filler = ['x = 1'];
    const blocks = findDupeBlocks([inputWith(2, filler)], 20);
    assert.equal(blocks.length, 1);
    const [b] = blocks;
    assert.equal(b?.fileA, 'a.py');
    assert.equal(b?.fileB, 'a.py');
    assert.ok((b?.lineA as number) < (b?.lineB as number));
    assert.ok((b?.tokens as number) >= 20);
  });

  it('does not report a near-miss shorter than the window', () => {
    const short = ['y = call_it(1, 2)'];
    const blocks = findDupeBlocks([inputWith(2, short)], 200);
    assert.equal(blocks.length, 0);
  });

  it('reports nothing when there is no repetition', () => {
    const lines = ['a = 1', 'b = call(2)', 'if a:', '    b += 3', 'return b'];
    const blocks = findDupeBlocks(
      [{ path: 'a.py', lines: lines.map((text, i) => ({ line: i + 1, text })), lang: 'py' }],
      10
    );
    assert.equal(blocks.length, 0);
  });

  it('merges overlapping windows into one block', () => {
    // a long repeated run with structurally distinct lines: the only
    // repetition is run-vs-run, so it must surface as a single block
    const runLines = [
      'result0 = compute(0)',
      'result1 = compute(1) + result0',
      'result2 = merge(result0, result1)',
      'if result2 > 10:',
      '    result2 = clamp(result2)',
      'result3 = compute(3) * 2',
      'total = result1 + result2 + result3',
      'log("done", total)',
      'cache.store(key, total)',
      'return finalize(total, flag=True)',
      'x0, y0 = split(total)',
      'z0 = combine(x0, y0, mode=1)',
    ];
    const renamed = runLines.map((l) =>
      l.replace(/result/g, 'r').replace(/total/g, 't').replace(/compute/g, 'cp')
    );
    const lines = [...runLines, 'middle = 1', ...renamed];
    const blocks = findDupeBlocks(
      [{ path: 'a.py', lines: lines.map((text, i) => ({ line: i + 1, text })), lang: 'py' }],
      15
    );
    assert.equal(blocks.length, 1);
    assert.ok((blocks[0]?.tokens as number) >= 60);
  });
});
