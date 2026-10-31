# sample-diff -- synthetic PR exercising every gate

`base/` and `head/` are two snapshots. Build a temp repo and diff them:

```sh
./run.sh   # from this directory; needs node and the built ../../dist/cli.js
```

Expected result: `diffgate check` **fails with exactly 3 violations**
(see `expected.json`):

1. `complexity` -- `checkout.py`: `process_order` went from complexity 5 to
   13 (max 10). Delta is +8, inside the +15 budget, so only this gate fires.
2. `dupe` -- `utils.go` (new file): the retry/backoff block appears twice
   (106 normalized tokens) -- extract the shared helper instead.
3. `growth` -- `data/routes.json`: +622 lines in one diff (limit 500) --
   split the change.

`fixed/` shows the same PR after addressing all three: split functions,
one shared retry helper, and the route table split into two files. Gating
`fixed` against `base` passes.

`demo.gif` / `demo-transcript.txt` in `examples/` were captured from real
runs of this exact scenario (see `scripts/make-demo-gif.py`).
