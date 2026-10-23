# Teeex

A browser LaTeX editor (React 19 + Vite 8 + CodeMirror 6). Documents are typeset
by **real pdfLaTeX** (TeX Live 2026, compiled to WebAssembly via
`texlyre-busytex` 1.4.0) running locally in the browser and rendered with PDF.js
6.4 — not by an HTML approximation of LaTeX.

## Architecture

```
Project files (entry resolved from \documentclass / isEntry)
│
▼
pdfLaTeX — WebAssembly, Web Worker        ← the only layout engine
│
├── PDF bytes ──┬──► pdf.js ──► preview
│               └──► download          ← the same bytes, not a re-render
├── SyncTeX     ────► source ↔ page mapping
└── log         ────► diagnostics
```
The preview and the exported file are **the same artifact**. The preview does not
compute its own layout, and export does not re-render the document, so the two
cannot disagree about line breaking, pagination, page size, or typography. Also,
the source handed to pdfLaTeX is never rewritten or stripped before compilation.

Alongside the PDF viewer, a **Structure** panel lists the document's sections,
labels, figures, tables, and citations as React navigation elements so you can
jump to source lines while a compile runs. It makes no claim to be a layout
preview.

## Getting started

```bash
npm install
```

The TeX engine's WASM and TeX Live data are not on npm — the full upstream
archive is ~498 MiB. A version-pinned subset (pdfTeX engine + texlive-basic) is
fetched into public/core/busytex/ by a prebuild step, along with pdf.js CMaps
and standard fonts. npm run dev and npm run build run it automatically; to do
it explicitly:

```bash
npm run engine
```

Then:

```bash
npm run dev
```

The first compile downloads the engine once (~128 MB across busytex.wasm and
texlive-basic.data) and caches it. Compiles take seconds, not milliseconds —
that is the cost of real TeX, and the same cost Overleaf pays server-side.

## Packages

texlive-basic and a curated set of common academic `.sty`/`.cls`/`.bst` files in `public/packages/` ship locally (35 standard academic packages plus Springer Nature `sn-jnl.cls` and `sn-basic.bst`, totaling 37 files).

Before the WASM engine runs, `preloadDocumentPackages()` resolves the transitive dependency closure of packages and classes declared in the preamble (`\usepackage`, `\RequirePackage`, `\LoadClass`, `\input`) and mounts them into MEMFS in parallel. Any remaining file is fetched on demand from a TeX Live 2026 package server.

### Essential Package Provisioning

Local packages are provisioned by `scripts/download-essential-packages.mjs` during `npm run predev` and `npm run prebuild`:
- **Bounded Concurrency & Retries**: Downloads run across 4 concurrent workers with 15-second timeouts and up to two retries per package.
- **Payload & Marker Validation**: Downloads and existing cached assets are validated before saving:
  - Rejects HTML error responses (even when served with binary headers) and explicit upstream error text (`Cannot GET`, `404 Not Found`).
  - Enforces size boundaries (minimum 30 bytes, maximum 8 MiB).
  - Checks for embedded NUL bytes in text packages.
  - Verifies expected source markers (e.g. `\ProvidesPackage`, `\ProvidesClass`, `\def`, `%` for TeX files; `ENTRY`, `FUNCTION` for BibTeX styles).
- **Atomic Writes & Digest Logging**: Downloads are staged in temporary files and atomically renamed into `public/packages/` upon full validation. Each package's size and SHA-256 digest are logged.
- **Strict Failure Policy**: If any package fails to download or pass validation, the provisioning script exits with an error (exit code 1) to prevent partial or corrupted builds.

> [!TIP]
> **Offline / Incomplete Package Override**:
> For offline development or environments with restricted external network access, set:
> ```bash
> TEEEX_ALLOW_INCOMPLETE_PACKAGES=1 npm run dev
> ```
> This issues a warning for missing packages while allowing compilation with whatever assets are already cached.

> [!NOTE]
> **Integrity Scope**:
> Computed SHA-256 digests are logged for auditing, but not validated against a remotely signed hash manifest. Source-marker checks are heuristic guards against corrupt or HTML error responses.

The default remote endpoint is proxied via `/api/texlive` (falling back to `https://texlive2026.texlyre.org`). To point at your own server (see `deploy/texlive-server`):

```
VITE_TEXLIVE_REMOTE_ENDPOINT=https://your-texlive-host
```

Set it to `off` to disable remote package resolution entirely; compilation is then limited to the locally provisioned package set.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (provisions assets first) |
| `npm run build` | Typecheck and production build |
| `npm run engine` | Provision the pdfTeX engine subset |
| `npm run engine:full` | Also provision XeTeX and LuaHBTeX |
| `npm run engine:verify` | Fail if engine assets are missing or incomplete |
| `npm test` | Unit and fuzz suites (vitest) |
| `npm run test:e2e` | Playwright browser verification suite |
| `npx playwright test tests/e2e/benchmark.spec.ts` | Capture cold-start, warm compile, and heap baselines to `docs/benchmarks.json` |
| `npm run lint` | oxlint |

## Status

docs/project-state.json records confirmed facts, architectural decisions and
their rationale, rejected hypotheses, open questions, and what has and has not
been verified. docs/support-matrix.json records per-capability status across
invocation, artifact, preview, export, and edge cases.

Both files distinguish implemented from verified. Nothing is described as
working on the strength of having been written.

### Known limitations

The first compile requires a ~128 MB engine download; compiles take seconds,
not milliseconds.

Offline use is limited to texlive-basic, public/packages/, and packages
previously cached in IndexedDB.

XeLaTeX and LuaLaTeX need the full engine profile and have no UI selector yet.

biblatex/Biber is not wired up; \addbibresource currently routes to the
BibTeX pass, which is incorrect for biblatex.

PDF hyperlinks are not yet clickable in the preview (annotations() is
implemented in pdfRenderer.ts but no annotation layer is mounted yet).

Cross-tab presence (CollaborationHub) uses BroadcastChannel within the
same browser; cross-user real-time CRDT collaboration is not yet implemented.

## Licensing

The TeX engine is texlyre-busytex,
AGPL-3.0-or-later. Operating a hosted service built on AGPL code carries a
source-disclosure obligation to its users. Review this before deploying
commercially.
