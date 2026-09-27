# RemoteReady NT React migration

This directory contains the React + TypeScript implementation.

## Commands

```sh
npm install
npm run dev
npm run lint
npm test
npm run test:visual
npm run build
npm run preview
```

Dashboard map behaviour, preparedness interactions and source catalogue rendering are implemented in React. Browser runtime data is versioned in `public/data/` and copied into the production build by Vite. The root `../data/` directory remains the source-refresh workspace for downloaded source pages, Excel inputs and offline fallbacks; it is not served by React.

`scripts/download_data.py` is optional and should only be run when refreshing public source data. It writes generated connectivity, facilities and source-log files to `public/data/`; it does not need to run to start, build or test the React app. The historical TC Lam track and exercise scenario are versioned directly in `public/data/`.

The production build uses Workbox through `vite-plugin-pwa`. Bundled files use content hashes and the app shows a refresh prompt when a new service-worker version is ready. Map tiles are cached only after they have been viewed; the application does not claim a complete offline basemap.

`npm test` runs unit and interaction tests. `npm run test:visual` compares Dashboard, Preparedness and Data sources against committed desktop and mobile Playwright snapshots. To intentionally approve a visual change, run:

```sh
npm run test:visual -- --update-snapshots
```
