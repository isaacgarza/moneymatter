#!/usr/bin/env bash
# homelab-next-tag.sh — print the `v<upstream>-hl.<N>` tag HEAD should be released as.
#
# Usage: .github/scripts/homelab-next-tag.sh      (run inside the repository, tags fetched)
#
# <upstream> is the newest upstream release tag (vX.Y.Z) merged into HEAD, so merging a sync
# PR moves the base by itself and restarts the counter at hl.1. <N> is one more than the
# highest existing hl number for that base.
#
# Prints nothing and exits 0 when HEAD already carries an hl tag, which makes a re-run of the
# workflow a no-op. Exits 1 when no upstream release tag is merged into HEAD.
# Side effects: none (the caller creates and pushes the tag).
set -euo pipefail

if [[ -n "$(git tag --points-at HEAD --list 'v*-hl.*')" ]]; then
  exit 0
fi

# The glob also matches `v0.34.2-hl.1`, so the anchored grep is what keeps releases only.
base="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname --merged HEAD |
  { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } |
  awk 'NR == 1 { print }')"

if [[ -z "$base" ]]; then
  echo "No upstream release tag (vX.Y.Z) is merged into HEAD" >&2
  exit 1
fi

last="$(git tag --list "${base}-hl.*" |
  sed -E "s/^${base//./\\.}-hl\\.//" |
  { grep -E '^[0-9]+$' || true; } |
  sort -n |
  awk 'END { print }')"

echo "${base}-hl.$((${last:-0} + 1))"
