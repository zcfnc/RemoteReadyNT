# RemoteReady NT MVP

中文项目交接、开发说明和后续路线图请阅读 [`PROJECT_HANDOVER_CN.md`](PROJECT_HANDOVER_CN.md)。

Interactive, offline-friendly prototype for the CDU IT Code Fair 2026 Data Innovation Challenge.

Serve `dist` with a local HTTP server. Run `python scripts/download_data.py` to refresh public source metadata, NT Government mobile-coverage workbooks, browser-ready connectivity GeoJSON and mapped essential services. If a portal is unavailable, checked-in data remains available and the failure is recorded in `data/download_log.json`.

The MVP includes a real interactive map, functional connectivity and facility layers, Normal/Cyclone/Tower Outage scenarios, cyclone uncertainty, community detail cards, a persistent preparedness checklist, a device-local offline data pack, and a transparent source catalogue. Resilience scores and scenario values are indicative prototype models and must be validated before operational use.

```powershell
python scripts/download_data.py
python -m http.server 4317 --directory dist
```

Then open `http://127.0.0.1:4317/index.html`.
