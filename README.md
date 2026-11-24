# Data Institute Mumbai · Practice Lab

An original, branded SQL and Python interview-practice app for Data Institute Mumbai. SQL runs in DuckDB WebAssembly and Python runs in Pyodide; learner code and challenge data stay in the browser. The app includes ten challenges per language, synthetic sample/edge-case datasets, hints, worked solutions, output checks, and saved drafts/progress.

## Local development

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

SQL worker/WASM assets load from jsDelivr and Python runtime assets load from the Pyodide CDN, so initial runtime setup requires network access.

## Build and deploy

```sh
npm run build
npm run preview
```

Import this folder into Vercel or run `npx vercel`. Vercel detects Vite, builds with `npm run build`, and serves `dist`; `vercel.json` routes app paths to the SPA entry point. No server secrets are needed.
