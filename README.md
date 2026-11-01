# diffgate

The 2-second pre-merge gate for AI-assisted diffs: a zero-config CLI that
checks **changed code only** for complexity, duplication, and PR growth --
locally, deterministically, with no model, no account, and no network.

AI writes code faster than humans can review it. Tests pass without catching
bugs, complexity silently grows, and eyeball review doesn't scale. diffgate
gates the diff itself in CI in under a second: this PR's new complexity,
this PR's duplication, this PR's reviewability -- pass or fail, with reasons.

![demo](examples/demo.gif)

## Install

```sh
npm install -g diffgate-cli
```

Requires Node.js 20+. Zero runtime dependencies.

## Usage

```sh
# gate the current diff (base auto-detected: merge-base with main, else HEAD~1)
diffgate check

# gate against an explicit base, emit GitHub Actions annotations
diffgate check --base origin/main --format github

# numbers only, no verdict (the "measure first" mode)
diffgate measure

# save a JSON manifest for tooling
diffgate check --json diffgate-report.json
```

`check` exits 0 on pass, 1 on fail -- drop it straight into CI:

```yaml
- run: npx -y diffgate-cli check --base ${{ github.event.pull_request.base.sha }} --format github
```

## The four gates (all on the diff, v1)

| Gate | Default | What it checks |
|------|---------|----------------|
| `complexity` | max 10 | a touched function above the max complexity fails |
| `delta` | max +15 | a touched function gaining more than this at once fails |
| `dupe` | 50 tokens | a normalized token block repeated in the diff fails |
| `growth` | +500 lines | a single file growing past this fails ("split this PR") |

Thresholds are configurable per flag (`--max-complexity N`, `--max-delta N`,
`--min-dupe-tokens N`, `--max-dupe-blocks N`, `--max-file-growth N`) or via a
`diffgate.json` in the repo root (see `diffgate.example.json`). Languages v1:
JavaScript/TypeScript, Python, Go.

Output formats: `human` (default table), `json` (manifest with
`result: pass|fail`), `github` (`::error file=...,line=...::` annotations).

## Method (stated honestly)

Complexity is a **token-based cyclomatic approximation** -- count branch
keywords and operators (`if`, `for`, `while`, `&&`, `||`, `??`, ternaries,
`elif`, `except`, ...) per function. Same class as `lizard`: fast and
deterministic, not compiler-grade. Duplication detection normalizes
identifiers to `id` and literals to `str`/`num`, then finds repeated token
windows with a rolling hash -- so copy-paste with renamed variables still
matches. A 500-file diff checks in ~0.7s on a laptop.

## What it is NOT

- It does **not** prove correctness. Structural gates don't prove semantics --
  the same caveat the ub-mode authors state for their own checks applies here.
- It does **not** detect AI-generated code and makes no authorship claims.
  There is no snake-oil "AI detector" inside.
- Complexity numbers are heuristic-class, not universal truths. Thresholds
  are team-tunable via flags or `diffgate.json`.
- It gates the **diff**, not the repo. Pre-existing tech debt is context,
  never a failure.

## Where rivals beat us

Honest comparison, checked 2026-10-31:

- **unclebob/ub-mode** wins on process depth: it guides the whole agent
  workflow (planning, review rounds, verification habits). diffgate is a
  2-second CI check, not a workflow. Complementary, not competing.
- **SonarQube / SonarCloud** wins on history: trend dashboards, leak-period
  tracking, and 30+ languages. diffgate sees one diff, three languages, no
  server.
- **lizard** wins on language breadth (20+ languages) and editor integrations.
  It reports numbers; diffgate adds verdicts, PR gating, and annotations.
- **Semgrep** wins on custom rules: you can encode your team's exact
  patterns. diffgate ships fixed gates with sane defaults -- no rule
  authoring, no rule maintenance.

## Roadmap

- New-lines-without-coverage when an lcov/cobertura file is supplied
- Mutation-lite on changed lines
- More languages (Java, C#, Rust)

## Development

```sh
npm install
npm run build     # tsc, strict
npm test          # 39 tests, all green
```

`examples/sample-diff/` is a synthetic base/pr/fixed repo exercising every
gate: run `examples/sample-diff/run.sh` to see the red-to-green flow, or
`npm run`-free via `node dist/cli.js check --base <sha>`.

## License

MIT
