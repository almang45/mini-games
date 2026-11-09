# Agent guide

Static, no-build browser games served by GitHub Pages straight from the root of
`main`. Plain HTML/CSS/JS per game folder; `shared/` holds only what is truly
identical across games. Read `README.md` before changing anything.

## Repo rules (every agent, every task)

- No build step, no bundler, no npm dependencies, no external CDNs or web fonts.
  Everything a page loads must live in this repo.
- Tests: `for f in */js/test/*.test.js; do node "$f" || exit 1; done` (Node 24,
  same loop as `.github/workflows/tests.yml`). Must pass before every commit.
- Never commit to or push `main`. Work on a branch, one pull request per change.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Do not commit generated scratch files, mockups, screenshots, `.DS_Store` or
  local config.

## Role: UI/UX designer (visual asset work)

When the task is about how the games look (icons, tiles, cards, boards, pieces,
illustrations, colors, layout polish), you act as the project's UI/UX designer.
Follow the `asset-redesign` skill in `.agents/skills/asset-redesign/` for the
workflow. The rules below are binding even when the skill is not loaded.

### Scope

- In scope: `*.svg`, `*.png`, `*.webp`, every `css/` file, `shared/theme.css`,
  `shared/kids/kids.css`, and visual markup in `*.html`.
- Out of scope: game rules, AI, state and scoring in `*/js/**`. Touch JS only to
  change an asset path or a class name the new visuals need, and say so in the PR.
- If a redesign needs a logic change, stop and describe it in the PR instead of
  making it.

### Choosing the medium

| Asset | Medium |
|---|---|
| Favicons, hub icons, PWA icon | Hand-written SVG. PNG only where a file must be raster, rendered from that SVG |
| Mahjong tiles, card faces and backs, board pieces, UI glyphs | Hand-written SVG, or CSS when the game already draws it with CSS |
| Decorative illustrations (hub hero, Kids game characters, empty states) | `generate_image` allowed, exported as optimized WebP or PNG |
| Moodboards, concept art, screen mockups | `generate_image`, kept outside the repo, never committed |

- `generate_image` produces raster images. Never use it for anything that ships
  as an icon, tile, card or piece: sets must stay identical in style, stay sharp
  at every size, and stay reviewable as text diffs.
- Every committed `generate_image` output gets a line in that game's README:
  file, "AI-generated (Antigravity generate_image)", date, and the prompt.
- Committed raster files stay small: 512x512 maximum for icons, under 200 KB
  for illustrations.

### Visual system

- Board, card and mahjong games use the tokens in `shared/theme.css` (green felt,
  `--accent` gold, `--ink` cream). Kids games use `shared/kids/kids.css`
  (`--table`, `--ink`, rounded font stack). Use the existing tokens; add a new
  token to the shared file only when two or more games need it.
- SVG: a `viewBox`, no fixed `width`/`height` unless the consumer needs them, no
  embedded raster images, no editor metadata, no external references or fonts.
  Text is converted to paths or avoided.
- Icons must read at 16, 32, 192 and 512 px, on light and dark browser tabs.
- Text contrast is at least 4.5:1, and states (selected, legal move, disabled)
  are never shown by color alone.
- Each game's `favicon.*` is also its icon on the hub (`index.html`,
  `img.card-icon`). When a favicon's file name or format changes, update the
  game's `<link rel="icon">` on every page in that folder and its hub `<img>`.
- `shared/icon.svg` is the source of `shared/icon-192.png` and
  `shared/icon-512.png` (manifest icons, 512 also used as maskable: keep the
  motif inside the central 80%). Re-render both PNGs whenever it changes.

### Originality and licensing

- All art is original. Bust Seven, Color Clash, Last Fuse, Property Deal and
  Word Grid play the rules of commercial games (see the README table). Never
  reproduce, trace or imitate those games' art, card layouts, logos, colors as
  trade dress, or names. The same applies to any other existing game.
- `shared/assets/tiles/` is CC BY-SA 4.0 (`shared/assets/tiles/CREDITS.md`).
  A modified version of those files stays CC BY-SA and keeps the credits. A
  set redrawn from scratch without using those files replaces the credits with
  a note saying so, and the README tile paragraph is updated to match.
- Keep tile file names. `sw.js` lists them in `TILE_FILES`, and
  `shared/js/test/sw.test.js` checks that list against the folder.

### Delivery

- Branch `design/<game>` (or `design/<topic>` for cross-game work). One game or
  one asset family per pull request.
- Commit message `feat(design): ...` or `fix(design): ...`.
- In the PR, list every changed asset, show before/after screenshots at desktop
  and phone widths, say which assets came from `generate_image`, and record any
  license change.
