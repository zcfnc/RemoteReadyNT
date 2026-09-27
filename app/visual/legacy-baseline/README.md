# Legacy Dashboard baseline

These screenshots are a read-only reference for the pre-React Dashboard. They are intentionally kept separate from the React Playwright snapshots.

Captured states:

- Stages 1–4 at desktop and mobile viewports.
- Stage 4 `Review Galiwinku` action at desktop and mobile viewports.
- Stage 4 `Why this community?` priority explanation at desktop and mobile viewports.

The screenshot test blocks OpenStreetMap tile requests so the visual record is stable. The map chrome, local overlay geometry and application UI remain visible.

Known product decisions after this legacy version:

- The React target removes the historical-track toggle, reset/restart controls, map-layer helper labels, map summary label and timeline heading.
- The React target removes `Why this community?` and instead highlights the dynamic top community as a red `PRIORITY: <community>` label.
