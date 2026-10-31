import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { measureFunctions, countBranches } from '../src/complexity.js';
import { tokenize } from '../src/tokenize.js';

describe('complexity', () => {
  it('counts a hand-computed js function as 5', () => {
    const src = `function checkout(cart) {
  let total = 0;
  for (const item of cart) {
    if (item.qty > 0) {
      total += item.price;
    } else if (item.coupon) {
      total -= 5;
    }
  }
  return total > 100 ? total * 0.9 : total;
}`;
    const [fn] = measureFunctions(src, 'js');
    assert.equal(fn?.name, 'checkout');
    assert.equal(fn?.complexity, 5); // 1 + for + if + if + ternary
  });

  it('counts a hand-computed python function as 5', () => {
    const src = `def process(items):
    total = 0
    for it in items:
        if it.ok and it.n > 1:
            total += it.n
        elif it.skip:
            continue
    return total
`;
    const [fn] = measureFunctions(src, 'py');
    assert.equal(fn?.name, 'process');
    assert.equal(fn?.complexity, 5); // 1 + for + if + and + elif
  });

  it('counts a hand-computed go function as 5', () => {
    const src = `package main

func handle(n int) int {
	if n != 1 {
		return 0
	}
	for i := 0; i < 3; i++ {
		if ok(i) && ready(i) {
			break
		}
	}
	return n
}
`;
    const [fn] = measureFunctions(src, 'go');
    assert.equal(fn?.name, 'handle');
    assert.equal(fn?.complexity, 5); // 1 + if + for + if + &&
  });

  it('does not count ?. as a ternary, counts ??', () => {
    const toks = tokenize('a?.b ?? c ? d : e;', 'js');
    assert.equal(countBranches(toks, 'js'), 2); // ?? and ?
  });

  it('finds arrow functions assigned to const', () => {
    const src = 'const run = async (x) => {\n  if (x) {\n    return 1;\n  }\n  return 0;\n};\n';
    const [fn] = measureFunctions(src, 'js');
    assert.equal(fn?.name, 'run');
    assert.equal(fn?.complexity, 2);
  });

  it('finds python methods by indentation', () => {
    const src = 'class A:\n    def m(self):\n        if self.x:\n            return 1\n        return 2\n\n    def n(self):\n        return 3\n';
    const fns = measureFunctions(src, 'py');
    assert.deepEqual(
      fns.map((f) => [f.name, f.startLine, f.endLine, f.complexity]),
      [
        ['m', 2, 5, 2],
        ['n', 7, 8, 1],
      ]
    );
  });

  it('ignores branch keywords hidden in strings', () => {
    const src = 'function f() {\n  const s = "if for while &&";\n  return s;\n}\n';
    const [fn] = measureFunctions(src, 'js');
    assert.equal(fn?.complexity, 1);
  });
});
