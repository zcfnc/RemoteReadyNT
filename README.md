# RemoteReady NT MVP

Static, offline-friendly prototype for the CDU IT Code Fair 2026 Data Innovation Challenge.

Open `dist/index.html` directly or serve `dist` with a static HTTP server. Run `python scripts/download_data.py` to refresh public source metadata. If a portal is unavailable, checked-in demo data remains available and the failure is recorded in `data/download_log.json`.

The MVP includes a resilience map, Normal/Cyclone/Tower Outage scenarios, community detail cards, a deployment queue and offline pack status. Demo values are estimates and must be replaced with dated source extracts before submission.
