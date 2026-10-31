// Git interaction: extract the unified diff between a base ref and HEAD,
// parse it per file, and read file contents at a given ref.

import { execFileSync, spawnSync } from 'node:child_process';

export interface AddedLine {
  line: number; // 1-based line number in the NEW version of the file
  text: string;
}

export interface FileDiff {
  path: string; // new path (b/ side)
  added: AddedLine[];
  addedCount: number;
}

function git(cwd: string, args: string[], quiet = false): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : undefined,
  });
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  const chunks = diffText.split(/^diff --git /m);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const plusMatch = chunk.match(/^\+{3} (.+)$/m);
    if (!plusMatch || !plusMatch[1]) continue;
    let path = plusMatch[1].trim();
    if (path === '/dev/null') continue; // deleted file
    if (path.startsWith('b/')) path = path.slice(2);
    // strip quotes git adds around paths with special chars
    if (path.startsWith('"') && path.endsWith('"')) {
      path = path.slice(1, -1);
    }
    const added: AddedLine[] = [];
    let newLine = 0;
    for (const raw of chunk.split('\n')) {
      const hunk = raw.match(HUNK_RE);
      if (hunk) {
        newLine = parseInt(hunk[1] as string, 10);
        continue;
      }
      if (newLine === 0) continue; // not inside a hunk yet
      if (raw.startsWith('+') && !raw.startsWith('+++')) {
        added.push({ line: newLine, text: raw.slice(1) });
        newLine += 1;
      } else if (raw.startsWith('-') && !raw.startsWith('---')) {
        // removed line: newLine unchanged
      } else if (raw.startsWith(' ')) {
        newLine += 1;
      } else if (raw.startsWith('\\')) {
        // "\ No newline at end of file" -- ignore
      }
    }
    files.push({ path, added, addedCount: added.length });
  }
  return files;
}

export function getDiff(base: string, cwd: string): FileDiff[] {
  const out = git(cwd, ['diff', '--no-color', '--no-ext-diff', '-U0', `${base}...HEAD`, '--']);
  return parseDiff(out);
}

export function getFileAt(ref: string, path: string, cwd: string): string | null {
  const m = getFilesAt(ref, [path], cwd);
  return m.get(path) ?? null;
}

/** Batch-read many files at one ref with a single `git cat-file --batch`
 *  process. Missing paths map to null. */
export function getFilesAt(ref: string, paths: string[], cwd: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (paths.length === 0) return out;
  const input = paths.map((p) => `${ref}:${p}`).join('\n') + '\n';
  const r = spawnSync('git', ['-C', cwd, 'cat-file', '--batch'], {
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
  const buf = (r.stdout ?? Buffer.alloc(0)) as Buffer;
  let off = 0;
  for (const p of paths) {
    const nl = buf.indexOf(0x0a, off);
    if (nl < 0) {
      out.set(p, null);
      break;
    }
    const header = buf.toString('utf8', off, nl);
    const [sha, type, sizeStr] = header.split(' ');
    const size = parseInt(sizeStr ?? 'NaN', 10);
    off = nl + 1;
    if (!sha || /^0+$/.test(sha) || type === 'missing' || !Number.isFinite(size)) {
      out.set(p, null);
      continue;
    }
    out.set(p, buf.toString('utf8', off, off + size));
    off += size + 1; // trailing newline after the blob
  }
  return out;
}

export function revParse(ref: string, cwd: string): string {
  return git(cwd, ['rev-parse', '--short', ref]).trim();
}

/** Zero-config base resolution: explicit flag wins, otherwise the merge-base
 *  with the mainline branch, otherwise the previous commit. */
export function resolveBase(explicit: string | undefined, cwd: string): string {
  if (explicit) return explicit;
  const head = git(cwd, ['rev-parse', 'HEAD']).trim();
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    try {
      const mb = git(cwd, ['merge-base', 'HEAD', candidate]).trim();
      // a merge-base equal to HEAD means we are sitting on that branch --
      // it tells us nothing about the fork point, so keep looking
      if (mb && mb !== head) return mb;
    } catch {
      // try next candidate
    }
  }
  try {
    return git(cwd, ['rev-parse', 'HEAD~1']).trim();
  } catch {
    throw new Error(
      'could not resolve a base ref: pass --base <ref> explicitly'
    );
  }
}

export function langOf(path: string): 'js' | 'py' | 'go' | null {
  if (/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/.test(path)) return 'js';
  if (/\.py$/.test(path)) return 'py';
  if (/\.go$/.test(path)) return 'go';
  return null;
}
