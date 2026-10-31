import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/tokenize.js';

describe('tokenize', () => {
  it('strips js line and block comments', () => {
    const toks = tokenize('// if for while\nconst x = 1; /* if */', 'js');
    const words = toks.filter((t) => t.kind === 'word').map((t) => t.text);
    assert.deepEqual(words, ['const', 'x']);
  });

  it('does not count branch keywords inside js strings', () => {
    const toks = tokenize('const s = "if (x) { for(;;) }";', 'js');
    const words = toks
      .filter((t) => t.kind === 'word' && t.norm !== 'str')
      .map((t) => t.text);
    assert.deepEqual(words, ['const', 's']);
    assert.ok(toks.some((t) => t.norm === 'str'), 'string becomes a str token');
  });

  it('keeps code inside template literal ${} expressions', () => {
    const toks = tokenize('const s = `v=${x ? a : b}`;', 'js');
    const texts = toks.map((t) => t.text);
    assert.ok(texts.includes('?'), 'ternary inside ${} should be tokenized');
    assert.ok(!texts.includes('v='), 'literal text should be blanked');
  });

  it('strips python # comments and triple-quoted strings', () => {
    const toks = tokenize('x = 1  # if for\ns = """if while"""\nif x:\n    pass', 'py');
    const words = toks
      .filter((t) => t.kind === 'word' && t.norm !== 'str')
      .map((t) => t.text);
    assert.deepEqual(words, ['x', 's', 'if', 'x', 'pass']);
  });

  it('strips go comments and raw strings', () => {
    const toks = tokenize('s := `if for {` // while\nif x {\n}', 'go');
    const words = toks
      .filter((t) => t.kind === 'word' && t.norm !== 'str')
      .map((t) => t.text);
    assert.deepEqual(words, ['s', 'if', 'x']);
  });

  it('emits one str token per string literal', () => {
    const toks = tokenize('a("x", "y");', 'js');
    assert.deepEqual(
      toks.map((t) => t.norm),
      ['id', '(', 'str', ',', 'str', ')', ';']
    );
  });

  it('normalizes identifiers and numbers for duplication detection', () => {
    const toks = tokenize('foo(bar, 42);', 'js');
    assert.deepEqual(
      toks.map((t) => t.norm),
      ['id', '(', 'id', ',', 'num', ')', ';']
    );
  });

  it('keeps line numbers across multiline input', () => {
    const toks = tokenize('a = 1\n\nb = 2', 'js');
    assert.equal(toks.find((t) => t.text === 'b')?.line, 3);
  });
});
