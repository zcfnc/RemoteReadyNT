# RemoteReady NT MVP

中文项目交接、开发说明和后续路线图请阅读 [`PROJECT_HANDOVER_CN.md`](PROJECT_HANDOVER_CN.md)。

Interactive, offline-friendly prototype for the CDU IT Code Fair 2026 Data Innovation Challenge.

The application is a React + TypeScript project in `app/`. It includes an exercise dashboard for historical TC Lam context and a simulated communications-site outcome, a preparedness checklist, an offline data pack and a data-source catalogue. Exercise conclusions are indicative and must be verified locally.

## Start development

```sh
cd app
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Validate or preview a production build

```sh
cd app
npm run lint
npm test
npm run build
npm run test:visual
npm run preview
```

React browser data is versioned in `app/public/data/` and is served as `/data/...`. The root `data/` directory contains refresh-script inputs, source caches and offline fallbacks; it is not served to the browser.

`python scripts/download_data.py` is optional. Run it only when intentionally refreshing external public data; it requires Python and `openpyxl`, writes generated data to `app/public/data/`, and is not needed to start or test the application.
