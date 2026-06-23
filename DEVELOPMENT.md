# TableDock — Development Guide

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (Node 22 recommended)
- npm

### Install

```bash
npm install
```

> The `postinstall` step rebuilds native modules (e.g. `better-sqlite3`) against Electron's ABI automatically.

> **macOS trackpad haptics (optional):** the noise slider can buzz the trackpad via the optional native module `node-mac-haptics`. Its bundled `node-gyp` imports `distutils`, which was removed in Python 3.12+, so on newer Python the build is skipped (the app still runs — haptics just no-op). To build it, point the install at a Python that still has `distutils`:
>
> ```bash
> npm_config_python=/usr/bin/python3 npm install   # macOS system Python 3.9
> ```
>
> Alternatively, `pip install setuptools` into your active Python (3.12+) to restore the `distutils` shim.

### Develop

```bash
npm run dev
```

### Build

```bash
npm run build         # type-check + bundle
npm run build:mac     # package a signed + notarized macOS .dmg (see below)
npm run build:win     # package for Windows
npm run build:linux   # package for Linux
```

### Packaging for macOS

Builds target **Apple Silicon (arm64)** and produce a `.dmg` (plus a `.zip`) in `dist/`.

**Quick local build (unsigned)** — for yourself or testers, no Apple account needed:

```bash
npm run build:mac:unsigned   # → dist/TableDock-<version>-arm64.dmg
```

Because it isn't signed/notarized, macOS Gatekeeper will warn on first open; install by dragging to Applications, then **right-click → Open** once (or `xattr -dr com.apple.quarantine /Applications/TableDock.app`).

**Distributable build (signed + notarized)** — for a clean double-click install, you need an [Apple Developer](https://developer.apple.com/) account ($99/yr) and a **Developer ID Application** certificate in your login keychain. Provide notarization credentials via environment variables, then run `npm run build:mac`:

```bash
# App Store Connect API key (recommended)
export APPLE_API_KEY=/path/to/AuthKey_XXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# …or an Apple ID + app-specific password
# export APPLE_ID=you@example.com
# export APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh-ijkl-mnop
# export APPLE_TEAM_ID=XXXXXXXXXX

npm run build:mac
```

electron-builder signs with the Developer ID cert (hardened runtime + the entitlements in `build/`) and notarizes the `.dmg`; the result opens with no Gatekeeper warning. Signing config lives in `electron-builder.yml`.

### Quality

```bash
npm run typecheck     # type-check main, preload, and renderer
npm run lint          # ESLint
npm run format        # Prettier
```

---

## 🧪 Testing

Tests run against **real databases in Docker** (no mocks). There are two layers:

- **Integration** (`test/integration/`, Vitest) — imports the driver classes directly and runs the full contract against the live containers: browse, pagination, server-side sort/filter, table structure/indexes, row CRUD, schema editing (create/alter/drop), Mongo aggregation/index/collection management, and Redis types/TTL/pagination.
- **E2E** (`test/e2e/`, Playwright + Electron) — launches the built app against a throwaway profile and drives the UI: the welcome screen + command palette, creating a connection through the form, and browsing seeded Postgres/MongoDB/Redis.

### Prerequisites

- **Docker** (daemon running) — used to spin up the databases.
- `npm install` — installs Vitest and Playwright. No `npx playwright install` is needed; the Electron runner uses the app's own Chromium.

### Commands

```bash
npm run test:db:up    # start Postgres, MySQL, MariaDB, MongoDB, Redis (seeded), wait until healthy
npm run test:int      # run the Vitest driver-integration suite (databases must be up)
npm run test:e2e      # build the app, then run the Playwright E2E suite
npm run test:db:down  # stop the containers and remove their volumes

npm run test:all      # db up → int → e2e   (leaves containers running for fast reruns)
npm run test:ci       # db up → int → e2e → always tear down, even on failure
```

Typical local loop: `test:db:up` once, then re-run `test:int` / `test:e2e` as you work, and `test:db:down` when finished. Use `test:ci` for a clean one-shot run.

### Test databases

Defined in `test/docker-compose.yml` on **non-standard host ports** so they never clash with a local install. Each is seeded once on first start (`test/seed/`) with a `tabledock_test` database containing `users` + `posts` (Mongo: a `users` collection):

| Database   | Host port | Credentials               |
| ---------- | --------- | ------------------------- |
| PostgreSQL | 55432     | `tabledock` / `tabledock` |
| MySQL      | 53306     | `root` / `tabledock`      |
| MariaDB    | 53307     | `root` / `tabledock`      |
| MongoDB    | 57017     | (no auth)                 |
| Redis      | 56379     | (no auth)                 |

Connection details live in `test/support/dbconfig.ts` and are shared by both suites. Host/ports are overridable via env (`TABLEDOCK_TEST_HOST`, `TABLEDOCK_PG_PORT`, `TABLEDOCK_MYSQL_PORT`, `TABLEDOCK_MARIADB_PORT`, `TABLEDOCK_MONGO_PORT`, `TABLEDOCK_REDIS_PORT`).

### Notes

- E2E isolation: the app honours `TABLEDOCK_USER_DATA`, so each E2E run gets a fresh, throwaway profile (no saved connections/history bleed between runs or into your real data).
- SQLite needs no container (it's a file); SQL Server is not in the harness yet.
- The integration suite imports driver classes directly (never the connection manager) so it runs under plain Node — `better-sqlite3` is built for Electron's ABI and is covered by the E2E layer instead.

---

## 🗂️ Project Structure

```
src/
├── main/              # Electron main process
│   └── db/            # Connection manager, per-driver implementations, IPC, SSL, filters
├── preload/           # Typed contextBridge API (window.api)
├── shared/            # Types shared across main, preload, and renderer
└── renderer/          # React app
    └── src/
        ├── components/
        │   ├── ui/          # Reusable primitives (Button, Modal, Tabs, DataTable, …)
        │   ├── relational/  # Table view, structure, query editor, history, relation diagram
        │   ├── mongo/       # Collection browser & document editor
        │   └── redis/       # Key browser & command console
        ├── lib/             # Helpers (CSV/JSON parsers & exporters, SQL dialect & safety)
        └── store/           # Zustand stores (connections, workspace, settings, toasts)
```

### Architecture

```
Renderer (React)  ──invoke──▶  Preload (window.api)  ──IPC──▶  Main (DB drivers + secure store)
```
