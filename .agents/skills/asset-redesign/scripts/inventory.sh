#!/usr/bin/env bash
# Prints a Markdown inventory of every tracked visual asset and the CSS that draws visuals itself.
# Usage: run from the repo root: .agents/skills/asset-redesign/scripts/inventory.sh
set -euo pipefail

if ! root=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "inventory.sh: not inside a git repository" >&2
  exit 1
fi
cd "$root"

dims() {
  case "$1" in
    *.svg)
      # The viewBox, not width/height, is what decides how an SVG scales.
      grep -o 'viewBox="[^"]*"' "$1" | head -n 1 | sed 's/viewBox=//; s/"//g' || true ;;
    *)
      file -b "$1" | grep -oE '[0-9]+ x [0-9]+' | head -n 1 || true ;;
  esac
}

refs() {
  local path="$1" dir base hits
  dir=$(dirname "$path")
  base=$(basename "$path")
  # Same-folder pages reference assets by bare name; other folders need the full path.
  hits=$( { git grep -lF -e "$path" -- '*.html' '*.css' '*.js' '*.webmanifest' 2>/dev/null || true
            git grep -lF -e "$base" -- "$dir/*.html" "$dir/*.css" "$dir/css/*.css" "$dir/js/*.js" 2>/dev/null || true
          } | grep -v '/test/' | sort -u | tr '\n' ' ' || true)
  if [ -z "$hits" ]; then
    # Tile faces are named at runtime and source SVGs are only documented, so fall back to the bare name anywhere.
    hits=$(git grep -lF -e "$base" -- '*.js' '*.md' 2>/dev/null | grep -v '/test/' | sort -u | sed 's/^/(by name) /' | tr '\n' ' ' || true)
  fi
  echo "${hits:-UNREFERENCED}"
}

echo "## Image files"
echo
echo "| File | Bytes | Size / viewBox | Referenced by |"
echo "|---|---|---|---|"
git ls-files -- '*.svg' '*.png' '*.webp' '*.jpg' '*.jpeg' '*.gif' '*.ico' | while IFS= read -r f; do
  bytes=$(wc -c < "$f" | tr -d ' ')
  echo "| \`$f\` | $bytes | $(dims "$f") | $(refs "$f") |"
done

echo
echo "## CSS that draws visuals"
echo
echo "| File | gradients | data URIs | box-shadows |"
echo "|---|---|---|---|"
git ls-files -- '*.css' | while IFS= read -r f; do
  g=$(grep -c 'gradient(' "$f" || true)
  d=$(grep -c 'url(.\{0,1\}data:' "$f" || true)
  s=$(grep -c 'box-shadow' "$f" || true)
  echo "| \`$f\` | $g | $d | $s |"
done
