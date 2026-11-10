---
name: asset-redesign
description: >-
  Audits and redesigns the visual assets of the Mini Games collection (favicons,
  hub icons, PWA icon, mahjong tiles, card faces, boards, pieces, illustrations
  and the CSS or art data that draws them). Use this skill when the user asks to
  review, audit, improve, restyle, re-create or replace any icon, image, tile,
  card, board or other visual in this repo, or asks for the UI/UX designer.
---

# Asset redesign

You are the project's UI/UX designer. The binding rules (scope, medium, visual
system, licensing, delivery) are in the root `AGENTS.md`. This skill is the
workflow. Work in phases and stop at each gate. Do not skip ahead to drawing.

Scripts (Node 24 built-ins only, run from anywhere in the repo):

- [inventory.mjs](./scripts/inventory.mjs): every image file (bytes, size or
  viewBox, notes such as non-square / editor metadata / over 200 KB, the files
  that use it, the docs that mention it); every CSS file and HTML page with
  their inline `<style>`, inline `<svg>`, SVG or canvas drawn from script, and
  inline `<script>` size; and the art defined in JS from
  [art-in-js.json](./resources/art-in-js.json). "(folder)" means a script
  builds the file name at runtime from that folder; "**none found**" with a
  docs entry usually means a source file, such as `shared/icon.svg`.
- [check-scope.mjs](./scripts/check-scope.mjs): classifies every change
  against `origin/main` as OK, REVIEW or BLOCKED per the `AGENTS.md` scope
  table, including edits inside inline `<script>` blocks. Exit 1 on BLOCKED.
- [render-png.sh](./scripts/render-png.sh): square SVG to exact-size PNG.
  Needs `rsvg-convert` (`brew install librsvg`), `resvg` or ImageMagick.

## Phase 1: Inventory

1. Run `node .agents/skills/asset-redesign/scripts/inventory.mjs` and keep its
   output for the audit.
2. Open the hub (`index.html`) and every game in the browser at desktop
   (1280x800) and phone (390x844) widths. Screenshot each to your artifacts
   directory, not the repo. For games with several screens (Card Table's 16
   games, Mahjong Table's trainer and quiz, Kids game modes), capture each one.

## Phase 2: Audit

Score every asset and every game screen against this checklist:

- **Fit:** does it say what the game is? Is it a generic placeholder?
- **Consistency:** does it match the theme tokens and the style of its siblings
  (all hub icons together, all tiles together, all cards together)?
- **Legibility:** is it readable at 16 and 32 px for icons, and at the phone
  layout for tiles and cards? Can a Kids game screen be understood without reading?
- **Accessibility:** is text contrast at least 4.5:1? Are states shown by more
  than color?
- **Craft:** check for blurry raster where SVG belongs, off-center motifs,
  inconsistent stroke weights, stray editor metadata, oversized files.
- **Originality:** is anything close to a commercial game's art or trade dress?
- **Reachability:** can the fix be done in scope? Visuals drawn inside inline
  `<script>` or non-listed JS go under "Needs a logic change", not in the plan.

Write the result to `docs/design/audit.md` using
[audit-template.md](./resources/audit-template.md): one row per finding with a
stable number, the evidence you saw, a priority (P1 broken or off-brand, P2
inconsistent, P3 polish), a one-line plan with the medium from `AGENTS.md`, and
status `open`. Only record problems you observed in the screenshots or the
inventory.

**Gate 1.** On branch `design/audit` from the latest `main`, commit only
`docs/design/audit.md` (`docs(design): add visual asset audit`), push it and
open a PR. Stop and ask the user which rows to do. The user approves by editing
or merging that PR; redesign work starts only after it is merged.

## Phase 3: Direction

For each approved game or asset family:

1. Generate 2-3 concept directions with `generate_image`: a moodboard or a
   mockup of the game screen with the new assets in place. Prompts describe the
   game's own theme and the tokens in `shared/theme.css` or
   `shared/kids/kids.css`. Never name a commercial game, brand or artist in a
   prompt.
2. Present the concepts to the user with the trade-offs of each.

**Gate 2.** Wait for the user to pick a direction. Concepts are never committed.

## Phase 4: Produce

`git fetch origin` and branch `design/<game>` from `origin/main`, which now
contains the audit.

- **SVG:** write it by hand from the chosen concept. Use a shared grid per set
  (for example every hub icon on a square 64-unit viewBox with 6-unit padding),
  shared stroke widths and token colors. Build one asset first, check it at
  every target size, then do the rest of the set.
- **Raster from SVG:** render the PNG with `render-png.sh <svg> <png> <size>`,
  never by hand-exporting. It refuses non-square or viewBox-less SVGs.
- **PWA icon:** if `shared/icon.svg` changes, give it a full-bleed opaque
  background and keep the motif inside the 40%-radius safe circle, then
  render `shared/icon-192.png` (192) and `shared/icon-512.png` (512).
- **Illustrations from `generate_image`:** crop, resize and convert to WebP or
  PNG under 200 KB, then add the provenance line to the game's README
  (file, "AI-generated (Antigravity generate_image)", date, prompt).
- **Art in JS:** edit only the symbols listed for that file in
  `art-in-js.json` and keep what its `keep` field names.
- **Wiring:** if a file name or format changes, update every
  `<link rel="icon">` in that game folder and its `img.card-icon` in
  `index.html`. Keep `shared/assets/tiles/` file names unchanged.
- **Licensing:** if any tile changes, update the per-file origin table in
  `shared/assets/tiles/CREDITS.md` and the README tile paragraph as `AGENTS.md`
  describes. A redrawn tile must be drawn without opening the upstream file.

## Phase 5: Verify

1. Run the test loop from `AGENTS.md`. All tests must pass.
2. Run `node .agents/skills/asset-redesign/scripts/check-scope.mjs`. Revert
   every BLOCKED line unless it is an asset-path or class-name edit you will
   justify in the PR. For each REVIEW line, confirm the listed limits hold.
3. Re-screenshot the same screens as Phase 1 at both widths, plus each new icon
   at 16, 32, 192 and 512 px, and on a light and a dark browser tab.
4. Compare before and after side by side. Fix regressions before going on.
5. Re-run `inventory.mjs` and confirm no new "**none found**", MISSING or
   over-limit rows.

## Phase 6: Deliver

Every commit on the branch ends with the trailer
`Co-Authored-By: Antigravity <noreply@antigravity.google>` (see `AGENTS.md`;
`sh .agents/hooks/install.sh` adds a hook that appends it), and
`check-scope.mjs` blocks a commit that has no `Co-Authored-By` trailer.

In the same branch, set the status of each row you closed in
`docs/design/audit.md` to `done in #<PR>` (or `partly done` with a note).
Commit with `feat(design): <game> ...`. Open a pull request against `main`
(draft if anything is unresolved) whose body has:

- the audit rows it closes, by number,
- a table of changed assets with their medium (SVG / CSS / art in JS /
  generated raster),
- before/after screenshots at desktop and phone widths, or their file paths
  for the user to attach if you cannot upload them,
- any license or provenance change,
- the `check-scope.mjs` output, with a justification for every BLOCKED or
  REVIEW line.

Then report the PR link and any open questions to the user.
