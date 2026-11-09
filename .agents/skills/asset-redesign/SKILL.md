---
name: asset-redesign
description: >-
  Audits and redesigns the visual assets of the Mini Games collection (favicons,
  hub icons, PWA icon, mahjong tiles, card faces, boards, pieces, illustrations
  and the CSS that draws them). Use this skill when the user asks to review,
  audit, improve, restyle, re-create or replace any icon, image, tile, card,
  board or other visual in this repo, or asks for the UI/UX designer.
---

# Asset redesign

You are the project's UI/UX designer. The binding rules (scope, medium, visual
system, licensing, delivery) are in the root `AGENTS.md`. This skill is the
workflow. Work in phases and stop at each gate. Do not skip ahead to drawing.

## Phase 1: Inventory

1. Run [inventory.sh](./scripts/inventory.sh) from the repo root. It lists every
   image file with its size, dimensions and the files that reference it, plus
   the CSS files that draw visuals themselves (inline SVG, gradients, data URIs).
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

Write the result to `docs/design/audit.md` using
[audit-template.md](./resources/audit-template.md): one row per asset, a
priority (P1 broken or off-brand, P2 inconsistent, P3 polish), and a
one-line plan per row stating the medium from `AGENTS.md`.

**Gate 1.** Commit the audit alone on branch `design/audit`, then stop and ask
the user which rows to do. Do not redesign anything before the user approves.

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

Branch `design/<game>` from the latest `main`.

- **SVG:** write it by hand from the chosen concept. Use a shared grid per set
  (for example every hub icon on a 64-unit viewBox with 6-unit padding), shared
  stroke widths and token colors. Build one asset first, check it at every
  target size, then do the rest of the set.
- **Raster from SVG:** render the PNG from its SVG with
  [render-png.sh](./scripts/render-png.sh), never by hand-exporting.
- **Illustrations from `generate_image`:** crop, resize and convert to WebP or
  PNG under 200 KB, then add the provenance line to the game's README
  (file, "AI-generated (Antigravity generate_image)", date, prompt).
- **Wiring:** if a file name or format changes, update every
  `<link rel="icon">` in that game folder and its `img.card-icon` in
  `index.html`. Keep `shared/assets/tiles/` file names unchanged.
- **Licensing:** if mahjong tiles change, update
  `shared/assets/tiles/CREDITS.md` and the README tile paragraph as `AGENTS.md`
  describes.

## Phase 5: Verify

1. Run the test loop from `AGENTS.md`. All tests must pass.
2. Re-screenshot the same screens as Phase 1 at both widths, plus each new icon
   at 16, 32, 192 and 512 px, and on a light and a dark browser tab.
3. Compare before and after side by side. Fix regressions before going on.
4. `git diff --stat`: confirm that only in-scope files changed. Any `*/js/**`
   change is an asset path or class name only.

## Phase 6: Deliver

Commit with `feat(design): <game> ...`. Open a pull request against `main`
(draft if anything is unresolved) whose body has:

- the audit rows it closes,
- a table of changed assets with their medium (SVG / CSS / generated raster),
- before/after screenshots at desktop and phone widths, or their file paths
  for the user to attach if you cannot upload them,
- any license or provenance change.

Then report the PR link and any open questions to the user.
