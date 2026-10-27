# Teeex

A modern, browser-native LaTeX editor (React 19 + Vite 8 + CodeMirror 6). Documents are typeset
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
└── log         ────► diagnostics & 1-click quick-fixes
```

The preview and the exported file are **the same authoritative artifact**. The preview does not
compute its own layout, and export does not re-render the document, so the two
cannot disagree about line breaking, hyphenation, pagination, page size, or typography. Also,
the source handed to pdfLaTeX is never rewritten or stripped before compilation.

Alongside the PDF viewer, an **Outline & Structure** panel lists the document's sections,
labels, figures, tables, and citations as navigation elements so you can
jump to source lines while a compile runs.

---

## Features

- **Authoritative Typesetting**: Real pdfLaTeX WebAssembly engine executing in a background Web Worker. What you see in the viewer is byte-for-byte identical to the exported PDF.
- **Bi-directional SyncTeX**: Precise source-to-PDF forward jump and double-click inverse navigation with vertical centering and laser-pulse highlights.
- **In-Document PDF Search & Navigation**:
  - Full-text search across all PDF pages via `findText` (`Ctrl+F` / `Cmd+F`).
  - Next/previous match cycling (`Enter` / `Shift+Enter`) with live counter (`[ 2 of 5 ]`) and auto-scroll to match coordinates.
  - Interactive page jump input (`Page [ 3 ] / 12`).
  - Native hyperref link annotations with strict URL protocol sanitization.
- **CodeMirror 6 LaTeX Authoring**:
  - Code folding for balanced `\begin{...} ... \end{...}` environments (equations, figures, tables, proofs).
  - Multi-file BibTeX aggregation across all project `.bib` files with deduplicated citation autocomplete.
  - Preamble package autocompletion and macro snippets.
- **Academic Template Presets**:
  - Built-in support for standard articles, **IEEEtran**, ACM (**`acmart`**), and Springer Nature (**`sn-jnl`**).
  - Automatic virtual filesystem mounting of companion packages, styles, font metrics (`.tfm`, `.fd`), and bibliography styles (`ACM-Reference-Format.bst`, `sn-basic.bst`).
  - Smart bibliography detection distinguishing standard BibTeX from `biblatex` (warning if `backend=bibtex` is required).
- **Capability-Based Cloud Sharing & Collaboration**:
  - Cryptographically secure share links with dedicated view tokens (`vw_...`) and edit tokens (`ed_...`).
  - Row Level Security (RLS) enforcement in Supabase with server-side SHA-256 capability token hashing and owner-pinning triggers.
  - Real-time CRDT synchronization via Yjs with capability header injection for anonymous collaborators.
  - Local cross-tab sync via `BroadcastChannel` with offline-first persistence (OPFS + IndexedDB fallback).

---

## Getting started

```bash
npm install
```

The TeX engine's WASM and TeX Live data are not on npm — the full upstream
archive is ~498 MiB. A version-pinned subset (pdfTeX engine + texlive-basic) is
fetched into `public/core/busytex/` by a prebuild step, along with PDF.js CMaps
and standard fonts. `npm run dev` and `npm run build` run it automatically; to do
it explicitly:

```bash
npm run engine
```

Then start the development server:

```bash
npm run dev
```

The first compile downloads the engine once (~128 MB across `busytex.wasm` and
`texlive-basic.data`) and caches it in browser storage. Compiles take seconds, not milliseconds —
that is the cost of real TeX, and the same cost Overleaf pays server-side.

---

## Packages

`texlive-basic` and a curated set of common academic `.sty`/`.cls`/`.bst` files in `public/packages/` ship locally (35 standard academic packages plus Springer Nature `sn-jnl.cls` and `sn-basic.bst`, totaling 37 files).

Before the WASM engine runs, `preloadDocumentPackages()` resolves the transitive dependency closure of packages and classes declared in the preamble (`\usepackage`, `\RequirePackage`, `\LoadClass`, `\input`) and mounts them into MEMFS.
- **In-Flight Request Deduplication**: Simultaneous requests for the same package file share a single in-flight promise to eliminate redundant roundtrips.
- **Bounded Fetch Concurrency**: Remote fetches are constrained to at most 8 parallel HTTP requests.
- **Payload Streaming Guard**: Responses are streamed with an 8 MiB upper limit; oversized responses or bodies advertising `Content-Length > 8 MiB` are immediately aborted.
- **160-File Cap**: Live resolution limits total preloaded files to 160 to prevent memory exhaustion from cyclic or unbounded package dependency trees.
- **Strict 404 Caching**: Only permanent HTTP 404 responses are cached as negative misses; transient 5xx errors or network drops remain retryable on subsequent compiles.

### Essential Package Provisioning

Local packages are provisioned by `scripts/download-essential-packages.mjs` during `npm run predev` and `npm run prebuild`:
- **Cryptographic Integrity Manifest**: Package sizes and SHA-256 digests are pinned in `scripts/essential-package-hashes.json`. Both newly downloaded files and existing cached assets are verified against this manifest.
- **Streaming Response Limits**: Upstream responses are inspected for `Content-Length` headers (> 8 MiB rejected immediately) and read in streamed chunks with hard cancellation if accumulated bytes exceed 8 MiB, preventing unbounded memory consumption.
- **Bounded Concurrency & Retries**: Downloads execute across configurable worker pools (default 4, bounded 1–16) with 15-second timeouts and up to two retries per package.
- **Payload & Marker Validation**: In addition to cryptographic hash validation, packages are checked for:
  - Prevention of HTML error payloads and server error messages (`Cannot GET`, `404 Not Found`).
  - Size boundaries (minimum 30 bytes, maximum 8 MiB).
  - Absence of embedded NUL bytes in plain text packages.
  - Expected TeX/BibTeX format markers (`\ProvidesPackage`, `\ProvidesClass`, `\def`, BibTeX entries).
- **Atomic Writes & Verification**: Downloads are staged in temporary files (`.tmp-*`) and atomically renamed into `public/packages/` only after full validation.
- **Strict Failure Policy**: Any download failure, size discrepancy, or hash mismatch triggers an immediate exit (code 1) to halt builds with corrupt assets.

> [!TIP]
> **Offline / Incomplete Package Override**:
> For offline development or environments with restricted external network access, set:
> ```bash
> TEEEX_ALLOW_INCOMPLETE_PACKAGES=1 npm run dev
> ```
> This issues a warning for missing packages while allowing compilation with whatever assets are already cached.

> [!NOTE]
> **Integrity Scope**:
> Manifest hashes in `scripts/essential-package-hashes.json` are repository-managed integrity pins rather than third-party signed cryptographic attestations from upstream CTAN/TeX Live mirrors. Source-marker heuristics provide defense-in-depth against upstream server error pages.

The default remote endpoint is proxied via `/api/texlive` (falling back to `https://texlive2026.texlyre.org`). To point at your own server (see `deploy/texlive-server`):

```bash
VITE_TEXLIVE_REMOTE_ENDPOINT=https://your-texlive-host
```

Set it to `off` to disable remote package resolution entirely; compilation is then limited to the locally provisioned package set.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (runs `predev` provisioning step first) |
| `npm run build` | Typecheck (`tsc`) and Vite production bundle |
| `npm run build:pages` | Typecheck, build, and prune assets exceeding Cloudflare Pages 25MB file limit (`scripts/prune-pages-dist.mjs`) |
| `npm run preview` | Run Vite local preview server on production build |
| `npm run fonts` | Download modern variable fonts into `public/fonts/` (`scripts/download-fonts.mjs`) |
| `npm run engine` | Provision the pdfTeX engine subset into `public/core/busytex/` (`scripts/fetch-engine.mjs`) |
| `npm run engine:full` | Also provision XeTeX and LuaHBTeX engine profiles (`scripts/fetch-engine.mjs --profile full`) |
| `npm run engine:verify` | Verify engine asset cryptographic digests against golden manifest (`scripts/fetch-engine.mjs --verify`) |
| `npm run engine:r2-upload` | Synchronize version-pinned engine assets to Cloudflare R2 bucket mirror (`scripts/upload-r2.mjs`) |
| `node scripts/download-essential-packages.mjs` | Prefetch essential companion `.sty`/`.cls` packages for offline use into `public/packages/` |
| `npm test` | Run Vitest unit & fuzz test matrix (506 tests across 56 files) |
| `npm run test:e2e` | Run Playwright browser verification suite |
| `npx playwright test tests/e2e/benchmark.spec.ts` | Capture cold-start, warm compile, and heap baselines to `docs/benchmarks.json` |
| `npm run lint` | Oxlint fast static analysis |

---

## Status

[`docs/project-state.json`](docs/project-state.json) records confirmed facts, architectural decisions and
their rationale, rejected hypotheses, open questions, and what has and has not
been verified. [`docs/support-matrix.json`](docs/support-matrix.json) records per-capability status across
invocation, artifact, preview, export, and edge cases.

Both files distinguish implemented from verified. Nothing is described as
working on the strength of having been written.

### Known limitations

- **Cold Engine Download**: The first compile requires downloading ~128 MB of WASM and TeX data; compiles take seconds, not milliseconds. Surfaced via real-time progress indicators in the UI.
- **Offline Package Scope**: Offline compilation is limited to `texlive-basic`, `public/packages/`, and packages previously cached in browser IndexedDB/OPFS.
- **XeLaTeX / LuaLaTeX Support**: Selectable from the Navbar engine dropdown. Full multi-engine compilation requires provisioning assets via `npm run engine:full`.
- **Biber Backend**: Browser WASM includes `bibtex8`. For `biblatex` users, `\usepackage[backend=bibtex]{biblatex}` is required as the standalone Perl Biber executable cannot run in browser WebAssembly.

---

## Licensing

The TeX engine is `texlyre-busytex`, licensed under **AGPL-3.0-or-later**.
- The engine executes entirely client-side within browser WebAssembly without proprietary server-side alterations.
- Links to upstream source repositories, licenses, and attributions are maintained in project documentation and the application interface.
- If you deploy Teeex Studio as a public network-accessible service, review AGPL-3.0 Section 13 regarding source code disclosure obligations.

