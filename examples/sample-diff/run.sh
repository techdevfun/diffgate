#!/bin/sh
# Build a temp repo from base/ -> head/ and run diffgate check on it.
# Expects exit 1 with exactly the 3 violations documented in expected.json.
set -e
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CLI="$HERE/../../dist/cli.js"
if [ ! -f "$CLI" ]; then
  echo "build first: (cd $HERE/../.. && npm run build)" >&2
  exit 2
fi
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
git -C "$D" init -q
git -C "$D" config user.email demo@diffgate.dev
git -C "$D" config user.name "diffgate demo"
cp -r "$HERE/base/." "$D/"
git -C "$D" add -A
git -C "$D" commit -qm base
BASE=$(git -C "$D" rev-parse HEAD)
cp -r "$HERE/head/." "$D/"
git -C "$D" add -A
git -C "$D" commit -qm pr
cd "$D"
node "$CLI" check --base "$BASE"
