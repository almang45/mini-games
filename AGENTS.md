# Agent guide

Static, no-build browser games served by GitHub Pages straight from the root of
`main`. Plain HTML/CSS/JS per game folder; `shared/` holds only what is truly
identical across games. Read `README.md` before changing anything.

## Repo rules (every agent, every task)

- No build step, no bundler, no npm dependencies, no external CDNs or web fonts.
  Everything a page loads must live in this repo.
- Tests (Node 24, the same loop as `.github/workflows/tests.yml`; the subshell
  keeps a failure from closing an interactive terminal):
  `( for f in */js/test/*.test.js; do node "$f" || exit 1; done )`.
  They must pass before every commit.
- Never commit to or push `main`. Work on a branch, one pull request per change.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **Every commit Antigravity makes ends with the trailer
  `Co-Authored-By: Antigravity <noreply@antigravity.google>`**, including the
  amends, fixups and merge commits it creates; another agent adds its own
  trailer instead. Write it in the message yourself. As a backstop,
  `.agents/hooks/commit-msg` appends it when the commit comes from Antigravity
  (install once per clone with `sh .agents/hooks/install.sh`), and
  `check-scope.mjs` blocks a branch with any commit that has no
  `Co-Authored-By` trailer.
- Do not commit generated scratch files, mockups, screenshots, `.DS_Store` or
  local config.

## Role: UI/UX designer (visual asset work)

When the task is about how the games look (icons, tiles, cards, boards, pieces,
illustrations, colors, layout polish), you act as the project's UI/UX designer.
Follow the `asset-redesign` skill in `.agents/skills/asset-redesign/` for the
workflow. The rules below are binding even when the skill is not loaded.

### Scope

Game logic lives in two places: `*/js/**` and the inline `<script>` blocks that
most board and solitaire games keep inside their HTML pages (the inventory
script lists them). Both are out of scope wherever they sit.

| You may change | Limits |
|---|---|
| Image files (`*.svg`, `*.png`, `*.webp`, `*.jpg`, `*.gif`, `*.ico`) | Rules below |
| Stylesheets: every `*.css` and inline `<style>` blocks in HTML | |
| HTML markup outside inline `<script>` blocks | Keep ids, classes and `data-*` attributes that scripts use |
| Docs: `*.md` (provenance lines, `CREDITS.md`, README asset notes) | Not `AGENTS.md` |
| `manifest.webmanifest` | Icon entries only |
| Art defined in JS, listed in `.agents/skills/asset-redesign/resources/art-in-js.json` | Only the symbols listed there, keeping what the `keep` field names |

- Everything else is out of scope: other `*/js/**` files, inline `<script>`
  blocks, `sw.js`, tests, `.github/`, `.agents/` and `AGENTS.md`.
- The only edit allowed out of scope is changing an asset path or a class name
  the new visuals need. Justify each one in the PR.
- If a redesign needs any other logic change, stop and describe it in the PR.
- `node .agents/skills/asset-redesign/scripts/check-scope.mjs` enforces this
  table, including edits inside inline `<script>` blocks. Run it before every
  commit; any BLOCKED line must be reverted or justified as above.

### Choosing the medium

| Asset | Medium |
|---|---|
| Favicons, hub icons, PWA icon | Hand-written SVG. PNG only where a file must be raster, rendered from that SVG |
| Mahjong tiles, card faces and backs, board pieces, UI glyphs | Hand-written SVG, or CSS / the art-in-JS data when the game already draws it that way |
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
  Text is converted to paths or avoided. Icons have a square `viewBox`.
- Icons must read at 16, 32, 192 and 512 px, on light and dark browser tabs.
- Text contrast is at least 4.5:1, and states (selected, legal move, disabled)
  are never shown by color alone.
- Each game's `favicon.*` is also its icon on the hub (`index.html`,
  `img.card-icon`). When a favicon's file name or format changes, update the
  game's `<link rel="icon">` on every page in that folder and its hub `<img>`.
- `shared/icon.svg` is the source of `shared/icon-192.png` and
  `shared/icon-512.png`. Re-render both with
  `.agents/skills/asset-redesign/scripts/render-png.sh` whenever it changes.
  The 512 file is also the maskable icon, so `shared/icon.svg` must have:
  - an opaque background that fills the whole viewBox (the renderer keeps
    transparency, and the OS fills transparent corners with its own color);
  - every important part of the motif inside the maskable safe zone, a circle
    centered on the icon with a radius of 40% of the icon width (205 px at
    512), not a square.

### Originality and licensing

- All art is original. Bust Seven, Color Clash, Last Fuse, Property Deal and
  Word Grid play the rules of commercial games (see the README table). Never
  reproduce, trace or imitate those games' art, card layouts, logos, colors as
  trade dress, or names. The same applies to any other existing game.
- `shared/assets/tiles/` is CC BY-SA 4.0 (`shared/assets/tiles/CREDITS.md`).
  Licensing is decided per file:
  - **Modified** (any edit to an existing tile, or a new file derived from one):
    stays CC BY-SA 4.0 and keeps the upstream credits, with "modified" noted.
  - **Redrawn from scratch** (drawn without opening, tracing or copying the
    upstream file): this repo's MIT license.
  - Any change to the tiles adds or updates a per-file origin table in
    `CREDITS.md` (file, origin: upstream / modified / original, license).
    Upstream credits stay as long as any file is upstream or modified. The
    README tile paragraph says which files are which, or points to that table.
- Keep tile file names. `sw.js` lists them in `TILE_FILES`, and
  `shared/js/test/sw.test.js` checks that list against the folder.

### Delivery

- The audit lands first, in its own PR (`design/audit`). Redesign branches
  start from a `main` that already contains it.
- Branch `design/<game>` (or `design/<topic>` for cross-game work). One game or
  one asset family per pull request.
- Commit message `feat(design): ...` or `fix(design): ...`.
- In the PR, list the audit rows it closes and update their status in
  `docs/design/audit.md`, list every changed asset, show before/after
  screenshots at desktop and phone widths, say which assets came from
  `generate_image`, record any license change, and paste the `check-scope.mjs`
  output with a justification for each BLOCKED or REVIEW line.
