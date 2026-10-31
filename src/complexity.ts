// Token-based cyclomatic complexity approximation (lizard-class):
// count branch keywords and branch operators per function.
// This is a heuristic, not a compiler-grade measurement -- the README says so.

import type { FuncMeasure, Lang } from './types.js';
import { codeLines, tokenize, type Token } from './tokenize.js';

const BRANCH_KEYWORDS: Record<Lang, Set<string>> = {
  js: new Set(['if', 'for', 'while', 'do', 'case', 'catch']),
  py: new Set(['if', 'elif', 'for', 'while', 'except']),
  go: new Set(['if', 'for', 'case']),
};

const BRANCH_WORD_OPS: Record<Lang, Set<string>> = {
  js: new Set(),
  py: new Set(['and', 'or']),
  go: new Set(),
};

const BRANCH_SYMBOL_OPS: Record<Lang, Set<string>> = {
  js: new Set(['&&', '||', '??']),
  py: new Set(),
  go: new Set(['&&', '||']),
};

/** Count branch points in a token stream. Ternary `?` counts unless it is `?.`. */
export function countBranches(tokens: Token[], lang: Lang): number {
  const kw = BRANCH_KEYWORDS[lang];
  const wordOps = BRANCH_WORD_OPS[lang];
  const symOps = BRANCH_SYMBOL_OPS[lang];
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.kind === 'word' && (kw.has(t.text) || wordOps.has(t.text))) {
      count++;
    } else if (t.kind === 'op' && symOps.has(t.text)) {
      count++;
    } else if (
      lang !== 'py' &&
      t.kind === 'op' &&
      t.text === '?' &&
      (tokens[i + 1] as Token | undefined)?.text !== '.'
    ) {
      count++;
    }
  }
  return count;
}

interface FuncSpan {
  name: string;
  startLine: number;
  endLine: number;
}

const JS_FUNC_RES = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\(|function\b)/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][A-Za-z0-9_$]*\s*=>/,
  // method / constructor: name(...) {  -- requires ) before the trailing {
  /^\s*(?:(?:public|private|protected|static|async|get|set|override)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^;{}]*\)\s*(?::\s*[^{};]+)?\s*\{\s*$/,
];

const JS_KEYWORD_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'else',
]);

function braceDelta(line: string): number {
  let d = 0;
  for (const c of line) {
    if (c === '{') d++;
    else if (c === '}') d--;
  }
  return d;
}

function findJsGoFunctions(lines: string[], lang: Lang): FuncSpan[] {
  const spans: FuncSpan[] = [];
  const res = JS_FUNC_RES;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    let name: string | null = null;
    if (lang === 'js') {
      for (const re of res) {
        const m = line.match(re);
        if (m && m[1] && !JS_KEYWORD_NAMES.has(m[1])) {
          name = m[1];
          break;
        }
      }
    } else {
      const m = line.match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (m && m[1]) name = m[1];
    }
    if (!name) continue;
    // find end by brace balance starting at the first { on/after this line
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      const d = braceDelta(lines[j] as string);
      if (!started) {
        if (d > 0 || (lines[j] as string).includes('{')) {
          started = true;
          depth += d;
          if (depth <= 0) {
            end = j;
            break;
          }
        } else if (j > i && d === 0 && !(lines[j] as string).includes('{') && (lines[j] as string).trim().endsWith(';')) {
          // single-expression body without braces (should be rare given regexes)
          end = j;
          break;
        }
        continue;
      }
      depth += d;
      end = j;
      if (depth <= 0) break;
    }
    spans.push({ name, startLine: i + 1, endLine: end + 1 });
  }
  return spans;
}

function findPyFunctions(lines: string[]): FuncSpan[] {
  const spans: FuncSpan[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const m = line.match(/^(\s*)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!m) continue;
    const indent = (m[1] as string).length;
    const name = m[2] as string;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const lj = lines[j] as string;
      if (lj.trim() === '') continue;
      const ind = lj.match(/^\s*/) as RegExpMatchArray;
      if ((ind[0] as string).length <= indent) break;
      end = j;
    }
    spans.push({ name, startLine: i + 1, endLine: end + 1 });
  }
  return spans;
}

/** Measure every function found in the source. Complexity = 1 + branch points. */
export function measureFunctions(source: string, lang: Lang): FuncMeasure[] {
  const lines = codeLines(source, lang);
  const tokens = tokenize(source, lang);
  const spans =
    lang === 'py' ? findPyFunctions(lines) : findJsGoFunctions(lines, lang);
  return spans.map((s) => {
    const body = tokens.filter((t) => t.line >= s.startLine && t.line <= s.endLine);
    return {
      name: s.name,
      startLine: s.startLine,
      endLine: s.endLine,
      complexity: 1 + countBranches(body, lang),
    };
  });
}
