// Per-language tokenizers (js/ts, python, go).
//
// Two phases: (1) blank out strings and comments (keeping line breaks so line
// numbers stay valid), (2) split the remaining code into tokens. Normalized
// forms map every identifier to `id` and every literal to `num`/`str` so
// duplication detection compares structure, not names.

import type { Lang } from './types.js';

export type TokenKind = 'word' | 'num' | 'op' | 'brace';

export interface Token {
  text: string;
  norm: string;
  kind: TokenKind;
  line: number; // 1-based
}

const JS_KEYWORDS = new Set(
  'break case catch class const continue debugger default delete do else export extends finally for function if implements in instanceof interface let new private protected public return static super switch this throw try typeof var void while with yield async await of'.split(' ')
);
const PY_KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ')
);
const GO_KEYWORDS = new Set(
  'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'.split(' ')
);

function keywordsOf(lang: Lang): Set<string> {
  return lang === 'js' ? JS_KEYWORDS : lang === 'py' ? PY_KEYWORDS : GO_KEYWORDS;
}

// Marker stamped in place of a string literal. It is a single private-use
// character (so it always fits), tokenizes separately, and normalizes to
// `str` -- blocks that differ only in string values still count as clones.
const STR_MARK = '\ue000';

/** Replace string/comment characters with spaces, preserving newlines.
 *  Each string literal leaves one STR_MARK behind. */
function blankNonCode(src: string, lang: Lang): string {
  const out: string[] = src.split('');
  const n = src.length;
  let i = 0;

  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  // Replace a string literal with the STR_MARK marker (keeps newlines).
  const stampString = (from: number, to: number): void => {
    blank(from, to);
    out[from] = STR_MARK;
  };

  while (i < n) {
    const c = src[i] as string;
    const next = (src[i + 1] ?? '') as string;

    // line comments
    if (lang !== 'py' && c === '/' && next === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (lang === 'py' && c === '#') {
      let j = i + 1;
      while (j < n && src[j] !== '\n') j++;
      blank(i, j);
      i = j;
      continue;
    }
    // block comments (js, go)
    if (lang !== 'py' && c === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      blank(i, j);
      i = j;
      continue;
    }
    // python triple-quoted strings
    if (lang === 'py' && (src.startsWith("'''", i) || src.startsWith('"""', i))) {
      const q = src.slice(i, i + 3);
      let j = i + 3;
      while (j < n && !src.startsWith(q, j)) {
        if (src[j] === '\\') j++;
        j++;
      }
      j = Math.min(n, j + 3);
      stampString(i, j);
      i = j;
      continue;
    }
    // quoted strings
    if (c === "'" || c === '"' || (c === '`' && lang !== 'py')) {
      const quote = c;
      let j = i + 1;
      if (quote === '`' && lang === 'js') {
        // template literal: keep ${...} code, blank the literal parts
        let segStart = i;
        while (j < n) {
          if (src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === '$' && src[j + 1] === '{') {
            stampString(segStart, j); // literal part before ${
            // scan the ${...} expression with brace depth
            let depth = 1;
            j += 2;
            while (j < n && depth > 0) {
              if (src[j] === '{') depth++;
              else if (src[j] === '}') depth--;
              j++;
            }
            segStart = j;
            continue;
          }
          if (src[j] === '`') {
            j++;
            break;
          }
          j++;
        }
        stampString(segStart, j);
      } else {
        const raw = lang === 'go' && quote === '`'; // go raw string: no escapes
        while (j < n) {
          if (!raw && src[j] === '\\') {
            j += 2;
            continue;
          }
          if (src[j] === quote) {
            j++;
            break;
          }
          j++;
        }
        stampString(i, j);
      }
      i = j;
      continue;
    }
    i++;
  }
  return out.join('');
}

export function codeLines(source: string, lang: Lang): string[] {
  return blankNonCode(source, lang).split('\n');
}

const TOKEN_RE =
  /[A-Za-z_$][A-Za-z0-9_$]*|\d[A-Za-z0-9_.]*|&&|\|\||\?\?|=>|==|!=|<=|>=|\+\+|--|<<|>>|[^\s]/g;

export function tokenize(source: string, lang: Lang): Token[] {
  const clean = blankNonCode(source, lang);
  const keywords = keywordsOf(lang);
  const tokens: Token[] = [];
  const lines = clean.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const lineText = lines[li] as string;
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(lineText)) !== null) {
      const text = m[0];
      let kind: TokenKind;
      let norm: string;
      if (text === STR_MARK) {
        kind = 'word';
        norm = 'str';
      } else if (/^[A-Za-z_$]/.test(text)) {
        kind = 'word';
        norm = keywords.has(text) ? text : 'id';
      } else if (/^\d/.test(text)) {
        kind = 'num';
        norm = 'num';
      } else if (text === '{' || text === '}' || text === '(' || text === ')' || text === '[' || text === ']') {
        kind = 'brace';
        norm = text;
      } else {
        kind = 'op';
        norm = text;
      }
      tokens.push({ text, norm, kind, line: li + 1 });
    }
  }
  return tokens;
}
