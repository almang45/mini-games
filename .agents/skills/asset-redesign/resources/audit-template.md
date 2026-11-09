# Visual asset audit

Date: YYYY-MM-DD · Commit: `<short sha>` · Auditor: Antigravity (asset-redesign skill)

## Summary

- Assets reviewed: N (icons N, tiles N, CSS-drawn visuals N, illustrations N)
- P1: N · P2: N · P3: N
- Cross-game themes: <for example: hub icons mix PNG photos and flat SVG; no shared grid>

## Findings

| # | Game | Asset | Problem | Checklist item | Priority | Plan | Medium |
|---|---|---|---|---|---|---|---|
| 1 | reversi | `reversi/favicon.png` | Blurry at 16 px, off-palette green | Legibility, Consistency | P1 | Redraw as SVG on the hub icon grid | SVG |
| 2 | … | … | … | … | … | … | SVG / CSS / generated raster |

Priority: P1 broken or off-brand · P2 inconsistent with siblings · P3 polish.

## Screens

| Game | Screen | Desktop | Phone | Notes |
|---|---|---|---|---|
| hub | index | ok | P2: icons uneven sizes | … |

## Out of scope / needs logic change

- <anything that cannot be fixed without touching game logic>
