import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

/** Create a temp git repo with `baseFiles` committed, then `headFiles` applied
 *  on top (merged over base). Returns { dir, baseSha }. */
export function makeRepo(
  baseFiles: Record<string, string>,
  headFiles: Record<string, string> = {}
): { dir: string; baseSha: string } {
  const dir = mkdtempSync(join(tmpdir(), 'diffgate-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@diffgate.dev']);
  git(dir, ['config', 'user.name', 'diffgate-test']);
  for (const [p, content] of Object.entries(baseFiles)) {
    const full = join(dir, p);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'base']);
  const baseSha = git(dir, ['rev-parse', 'HEAD']).trim();
  if (Object.keys(headFiles).length > 0) {
    for (const [p, content] of Object.entries(headFiles)) {
      const full = join(dir, p);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    }
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'head']);
  }
  return { dir, baseSha };
}
