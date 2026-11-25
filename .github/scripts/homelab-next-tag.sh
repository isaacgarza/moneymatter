#!/usr/bin/env bash
# homelab-next-tag.sh — print the `v<upstream>-hl.<N>` tag HEAD is, or should be, released as.
#
# Usage: .github/scripts/homelab-next-tag.sh      (run inside the repository, tags fetched)
#
# If HEAD already carries an hl tag, prints the newest one: a re-run of the release workflow
# must rebuild that tag, not decide HEAD has nothing to release.
#
# Otherwise <upstream> is the newest upstream release behind HEAD, and <N> is one more than the
# highest existing hl number for it. A release is behind HEAD when its tag is merged into HEAD,
# or when a commit subject says `merge upstream vX.Y.Z` (the sync workflow's PR title), which
# is what survives a squash merge: that drops the release commit from HEAD's ancestry.
#
# Exits 1 when no upstream release can be found. Side effects: none (the caller creates and
# pushes the tag).
set -euo pipefail

readonly RELEASE='v[0-9]+\.[0-9]+\.[0-9]+'

on_head="$(git tag --points-at HEAD --list 'v*-hl.*' |
  { grep -E "^${RELEASE}-hl\.[0-9]+\$" || true; })"
if [[ -n "$on_head" ]]; then
  # Same sort key as below: base, then the build number.
  echo "$on_head" | sed -E 's/-hl\./ /' | sort -V -k1,1 -k2,2n | tail -n 1 | sed -E 's/ /-hl./'
  exit 0
fi

# The glob also matches `v0.34.2-hl.1`, so the anchored grep is what keeps releases only.
merged="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --merged HEAD |
  { grep -E "^${RELEASE}\$" || true; })"
announced="$(git log --format=%s HEAD |
  { grep -oE "^chore: merge upstream ${RELEASE}" || true; } |
  { grep -oE "${RELEASE}\$" || true; })"

base="$(printf '%s\n%s\n' "$merged" "$announced" |
  { grep -E "^${RELEASE}\$" || true; } |
  sort -V |
  tail -n 1)"

if [[ -z "$base" ]]; then
  echo "No upstream release (vX.Y.Z tag merged into HEAD, or a 'merge upstream vX.Y.Z' commit) found" >&2
  exit 1
fi

last="$(git tag --list "${base}-hl.*" |
  sed -E "s/^${base//./\\.}-hl\\.//" |
  { grep -E '^[0-9]+$' || true; } |
  sort -n |
  tail -n 1)"

echo "${base}-hl.$((${last:-0} + 1))"
