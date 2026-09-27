# Dashboard legacy baseline and React gap list

Captured on 2026-09-26 from `dist/` at `127.0.0.1:4317`. The legacy Dashboard loaded its map, historical track and exercise scenario without 404 errors.

## Interaction facts

| State | Legacy behaviour |
| --- | --- |
| Stages 1–3 | Banner identifies a historical exercise and each selected timeline stage updates the exercise-card stage text and action copy. |
| Stage 4 | Banner changes to the simulated unavailable-site message; the primary card changes to `Verify conditions in Galiwinku`, exposes rank and confidence, and shows Review/Why actions. |
| `Review Galiwinku` | Opens the community/action detail context and moves the map to the selected priority community. |
| `Why this community?` | Opens a distinct priority explanation: score, confidence, candidate ranking and contributing factors. It is not equivalent to Review. |
| Desktop map panel | Default-expanded left panel; search has an arrow button and two exercise-focus shortcuts. The map has zoom, reset extent, location and fullscreen controls. |
| Mobile map panel | Default-expanded panel takes most of the viewport and visually overlaps the timeline. This is a legacy defect to avoid, not a layout to reproduce unchanged. |

## Measurements and layout facts

- Desktop header: compact single row with brand at left, centred navigation, source-refresh timestamp and help button at right.
- Desktop dashboard: alert banner, a separate 40px-style summary strip, then map workspace. The explorer is left-aligned; exercise context and action card are right-aligned; timeline runs across the lower centre; legend sits above it.
- Desktop stage-4 reference is `stage-4-desktop.png`; the two priority details are `review-galiwinku-desktop.png` and `why-priority-desktop.png`.
- Mobile header removes desktop navigation/status details, uses a bottom nav, and renders map overlays as temporary/floating content.

## React gap list, sorted by severity

1. **P0 — priority interaction is not equivalent.** React gives `Why this community?` and `Review Galiwinku` the same `setSelected` handler; no priority explanation exists. Product direction is to remove Why and show a red dynamic `PRIORITY: <community>` label, while retaining a Review action that visibly focuses the map and opens relevant details.
2. **Historical — visual-system gap at capture time.** The initial React Dashboard was a sparse shell rather than an equivalent migration. Subsequent React work addressed the header, map controls, panel hierarchy, action card and responsive layout; these screenshots remain a historical reference rather than current acceptance criteria.
3. **P1 — map semantics and framing diverge.** The legacy map has stage-aware focused framing, labelled scenario/priority markers and map tools. React uses simplified circles/lines and lacks the equivalent tool layout and interaction feedback.
4. **P1 — product decisions are not all carried into React.** React still renders the disabled `Historical TC Lam track` control. The approved target is a fixed presentation background with no switch. React must also keep the approved removals: reset/restart, map-layer helper labels, summary label, timeline heading and Why button.
5. **P1 — responsive layout needs intentional redesign.** Legacy mobile has serious overlay collisions. React should match the intended information hierarchy but must not copy the collision where the default-expanded explorer blocks timeline actions.
6. **P2 — dashboard chrome differs.** React currently substitutes `React migration shell` for source freshness/help UI and simplifies the map explorer search/shortcut behaviour.

## Intentional differences for the React target

These legacy elements are documented for context only and must not be restored: `Historical TC Lam track` user toggle, Map layers helper copy, Reference layers helper copy, `Explore map` panel title, Reset exercise, Restart, the map summary label, timeline heading/current-stage text, and `Why this community?`.
