#!/usr/bin/env bash
# Renders an SVG to a square PNG so raster icons always come from their SVG source.
# Usage: render-png.sh <input.svg> <output.png> <size-px>
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: render-png.sh <input.svg> <output.png> <size-px>" >&2
  exit 2
fi
in="$1" out="$2" size="$3"

if [ ! -f "$in" ]; then
  echo "render-png.sh: input not found: $in" >&2
  exit 1
fi
case "$size" in
  ''|*[!0-9]*) echo "render-png.sh: size must be a positive integer, got '$size'" >&2; exit 2 ;;
esac

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w "$size" -h "$size" -o "$out" "$in"
elif command -v resvg >/dev/null 2>&1; then
  resvg -w "$size" -h "$size" "$in" "$out"
elif command -v magick >/dev/null 2>&1; then
  magick -background none -density 384 "$in" -resize "${size}x${size}" "$out"
else
  echo "render-png.sh: no SVG rasterizer found; install librsvg (brew install librsvg) or resvg" >&2
  exit 1
fi

echo "rendered $in -> $out (${size}x${size})"
