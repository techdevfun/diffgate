import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, getDiff, resolveBase } from '../src/git.js';
import { makeRepo } from './helpers.js';

describe('git', () => {
  it('parses added lines with correct new-file line numbers', () => {
    const diff = `diff --git a/x.py b/x.py
index 111..222 100644
--- a/x.py
+++ b/x.py
@@ -1,3 +1,5 @@
 keep
-old1
+new1
+new2
 keep2
`;
    const [f] = parseDiff(diff);
    assert.equal(f?.path, 'x.py');
    assert.deepEqual(
      f?.added.map((a) => [a.line, a.text]),
      [
        [2, 'new1'],
        [3, 'new2'],
      ]
    );
  });

  it('skips deleted files', () => {
    const diff = `diff --git a/gone.py b/gone.py
deleted file mode 100644
--- a/gone.py
+++ /dev/null
@@ -1 +0,0 @@
-x = 1
`;
    assert.equal(parseDiff(diff).length, 0);
  });

  it('extracts a real diff between base and HEAD', () => {
    const { dir, baseSha } = makeRepo(
      { 'a.js': 'const x = 1;\n' },
      { 'a.js': 'const x = 1;\nconst y = 2;\n' }
    );
    const diffs = getDiff(baseSha, dir);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0]?.path, 'a.js');
    assert.deepEqual(diffs[0]?.added, [{ line: 2, text: 'const y = 2;' }]);
  });

  it('resolveBase prefers the explicit ref', () => {
    const { dir, baseSha } = makeRepo({ 'a.js': 'x\n' });
    assert.equal(resolveBase(baseSha, dir).slice(0, 7), baseSha.slice(0, 7));
  });

  it('resolveBase falls back to HEAD~1', () => {
    const { dir, baseSha } = makeRepo({ 'a.js': 'x\n' }, { 'a.js': 'y\n' });
    const resolved = resolveBase(undefined, dir);
    assert.equal(resolved.slice(0, 7), baseSha.slice(0, 7));
  });
});
