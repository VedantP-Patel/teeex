# Teeex

A browser LaTeX editor. Documents are typeset by **real pdfLaTeX** (TeX Live 2026,
compiled to WebAssembly) running locally in the browser — not by an HTML
approximation of LaTeX.

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
cannot disagree about line breaking, pagination, page size, or typography.

This matters because TeX's layout cannot be reproduced in CSS. Knuth–Plass
total-fit line breaking, Liang hyphenation patterns, TFM font metrics, and
LaTeX's float placement algorithms have no browser equivalent. An HTML preview
of a LaTeX document is an approximation by construction; the only way to show
what the document actually looks like is to typeset it.

There is a second, clearly-labelled **Outline** surface: an instant HTML skim of
the source, useful for orientation while a compile runs. It does not paginate and
makes no claim about layout — only the engine knows where a page ends. It cannot
be exported.

## Getting started

```bash
npm install
```

The TeX engine's WASM and TeX Live data are not on npm — the full upstream
archive is ~498 MiB. A version-pinned subset (pdfTeX engine + `texlive-basic`) is
fetched into `public/core/busytex/` by a prebuild step, along with pdf.js CMaps
and standard fonts. `npm run dev` and `npm run build` run it automatically; to do
it explicitly:

```bash
npm run engine
```

Then:

```bash
npm run dev
```

The first compile downloads the engine once and caches it. Compiles take
seconds, not milliseconds — that is the cost of real TeX, and the same cost
Overleaf pays server-side.

## Packages

Only `texlive-basic` ships with the engine. Any other package a document loads —
`IEEEtran`, `acmart`, `tikz`, `biblatex` — is fetched per-file at compile time
from a TeX Live 2026 package server, so package support is not limited to the
bundled set.

The default endpoint is public and third-party. For production, self-host it
(see `texlyre-busytex-build/texlive-server`) and set:

```
VITE_TEXLIVE_REMOTE_ENDPOINT=https://your-texlive-host
```

Set it to `off` to disable on-demand resolution entirely; compilation is then
limited to the bundled package set. See `.env.example`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (provisions assets first) |
| `npm run build` | Typecheck and production build |
| `npm run engine` | Provision the pdfTeX engine subset |
| `npm run engine:full` | Also provision XeTeX and LuaHBTeX |
| `npm run engine:verify` | Fail if engine assets are missing or incomplete |
| `npm test` | Unit and fuzz suites |
| `npm run test:e2e` | Browser differential and golden-image suites |
| `npm run lint` | oxlint |

## Status

`docs/project-state.json` records confirmed facts, architectural decisions and
their rationale, rejected hypotheses, open questions, and what has and has not
been verified. `docs/support-matrix.json` records per-capability status across
invocation, artifact, preview, export, and edge cases.

Both files distinguish **implemented** from **verified**. Nothing is described as
working on the strength of having been written.

### Known limitations

- The first compile requires an engine download; compiles are seconds, not
  milliseconds.
- Offline use is limited to the bundled package set.
- XeLaTeX and LuaLaTeX need the `full` engine profile and have no UI selector yet.
- `biblatex`/Biber is not wired up; `\addbibresource` currently routes to the
  BibTeX pass, which is incorrect for biblatex.
- PDF hyperlinks are not yet clickable in the preview (annotations are read but
  no layer is rendered).
- The Outline surface is built on a regex pipeline, not a parser, and has known
  gaps with brace-nested macro arguments, verbatim content, and nested `\input`.
- The editor is a `<textarea>` with a highlight backdrop: no virtualization or
  incremental parsing, so very large files are slow.
- No performance numbers are published, because none have been measured.

## Licensing

The TeX engine is [`texlyre-busytex`](https://github.com/TeXlyre/texlyre-busytex),
**AGPL-3.0-or-later**. Operating a hosted service built on AGPL code carries a
source-disclosure obligation to its users. Review this before deploying
commercially.
