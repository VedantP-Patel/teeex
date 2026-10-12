# Teeex — Competitive Analysis & Roadmap to #1

> Honest version. Competitor facts are from general knowledge of these products
> up to the author's cutoff, not a live scrape today — where a claim would drive
> a real decision, verify it live first (flagged inline). Teeex facts are from
> this codebase and the verified test suite.

---

## 1. The landscape, and what to take from each

| Product | Model | Real strengths | Real weaknesses | Steal this |
|---|---|---|---|---|
| **Overleaf** | Server TeX Live, cloud | The standard. Full TeX, every package, rich templates, real-time collab, journal integrations, git/Dropbox sync. | Compiles are server round-trips (queued, slow under load); free tier throttled; closed; heavy UI. | Template gallery depth; "rich text" (visual) mode; error-to-source jumping; package completeness as the bar. |
| **Papeeria** | Server TeX | Cheap, Git built in, plot builder. | Dated UI; smaller user base. | Git-native workflow. |
| **Authorea / Curvenote** | Hybrid WYSIWYG | Modern writing UX, data/notebook embedding, web-first output. | Not real LaTeX fidelity; lock-in. | Block-based writing feel; web-native reading view. |
| **TeXpage / LaTeXBase** | Server TeX | Fast, clean, cheap. | Thin feature set. | Minimal, fast onboarding. |
| **VS Code + LaTeX Workshop** | Local TeX | Best editor on earth; local, free, scriptable; SyncTeX. | No collab; requires a local TeX install; setup friction. | Editor quality bar; SyncTeX UX; build recipes. |
| **typst.app** | Typst (not TeX), server+WASM | Instant incremental compile, modern language, superb error messages, live collaborative. | Not LaTeX — can't open the world's existing `.tex`. | **Incremental sub-second compile feel; error messages as a feature; the "it just updates" loop.** |

**The one that should scare us is typst.app** — not because it's LaTeX (it isn't), but because it proved the UX bar: edits reflect in well under a second, errors are human, and it never feels like you're waiting on a server. Our architecture (local WASM TeX) is the only LaTeX-compatible way to chase that feel. That is our wedge: **Overleaf's compatibility with typst.app's responsiveness.**

---

## 2. Where Teeex stands today (measured, not claimed)

**Wins already real:**
- **Zero-backend compile.** Real pdfLaTeX in the browser; no server queue. Verified: ~0.8–0.9s warm compile+render, 38ms outline feedback (`docs/benchmarks.json`).
- **Preview == export by construction.** One artifact; the whole class of Overleaf-style "looks different when I download" bugs cannot occur. Verified by `tests/e2e/pdf-fidelity.spec.ts`.
- **Real SyncTeX**, real structured diagnostics with actionable hints.
- **Privacy**: the document never leaves the browser to be typeset (only package fetches go out).

**Losing today:**
- **Package breadth in practice.** Only `texlive-basic` is bundled; heavy classes (acmart, sn-jnl) don't resolve in usable time (`support-matrix.json`). Overleaf has everything, instantly.
- **Cold start ~6.7s** (engine download/init) vs Overleaf's "it's just there."
- **Editor** is a plain `<textarea>` — no virtualization, no LSP-grade completion, far behind VS Code and even Overleaf's CodeMirror 6.
- **No templates gallery** worth the name; no journal submission integrations; no git/Dropbox sync.
- **Collaboration** is demo-grade (BroadcastChannel + simulated peers), not production CRDT.

---

## 3. What's actually useful vs. what's noise

A pass over the feature set, judged by "does a real LaTeX author use this weekly?"

**Keep & invest (core value):**
- Real compile + preview + export (the whole point)
- Diagnostics with jump-to-source + SyncTeX
- BibTeX/citation autocomplete
- Figure/asset management
- Templates (as *real* starting points)
- Export (.pdf, project .zip)

**Keep but de-emphasize (nice, not differentiating):**
- Visual/WYSIWYG editor, symbol palette, table builder — good onboarding aids.
- Word count / conference limits — genuinely useful to academics.

**Reconsider / likely cut (cost > value, or fake):**
- **Simulated peers / demo collaboration** — remove or replace with real CRDT. Currently theatre.
- **"Developer unlock" / demo mode machinery** (`developerService.ts`) — ships dead weight to every user.
- **Encryption modal** — client-side doc encryption is a niche claim that's easy to get dangerously wrong; verify the threat model or cut.
- **Audit log, admin users, DOI import, presentation mode** — each is a half-feature; either commit to one and finish it, or cut to shrink surface and bundle.

The discipline: **a smaller set of features that each fully work beats a long menu of half-features.** That is also the brief's own standard ("a feature that works only in a demo is broken").

---

## 4. Roadmap to #1, in priority order

Each item lists the concrete first move in *this* codebase.

### Tier 1 — Make the core undeniable (weeks)
1. **Kill cold-start pain.** Precache the engine via a service worker; show a real first-run progress UI; keep the engine warm across sessions. *First move:* a service worker caching `/core/busytex/*` + `/pdfjs/*`.
2. **Package breadth that actually works.** Self-host the TeX Live package server (the brief already allows this) so acmart/sn-jnl/tikz resolve in <2s, and warm a cache of the top ~50 classes. *First move:* stand up `texlive-busytex-build/texlive-server`, point `VITE_TEXLIVE_REMOTE_ENDPOINT` at it, and remove the `remote-heavy` caveat as each class is verified.
3. **Editor → CodeMirror 6.** This is the single biggest perceived-quality jump. Lezer LaTeX grammar, virtualization, real completion/folding, SyncTeX gutter. *First move:* replace `Editor.tsx`'s textarea core while keeping the surrounding toolbar.

### Tier 2 — The "never bored / live" feel (weeks)
4. **Incremental compile feel.** Keep the last PDF, diff-scroll to the changed page, show per-page re-render as it lands; sub-second visual feedback on every keystroke pause.
5. **Design system (Phase F).** Replace ~2,000 lines of inline styles with primitives on the existing token system; one coherent, fast, accessible, reduced-motion-respecting UI. Purposeful motion only (state transitions, progress), never decoration.
6. **Real templates gallery** — IEEE/ACM/Springer/thesis/CV/beamer, each verified to compile (tie to the package-server work).

### Tier 3 — Trust & scale (weeks)
7. **Real collaboration** (Yjs/CRDT over WebRTC or a tiny relay) replacing the simulated peers, or cut collab entirely until it's real.
8. **Security hardening** (see §5).
9. **Git/Dropbox sync**, journal submission export.

### Always-on
10. **Benchmarks + differential golden suite in CI** so #1 is provable and stays provable.

---

## 5. Security review (from the code, concrete)

| Finding | Severity | Note |
|---|---|---|
| `.env.local` with a Supabase anon key is **not** committed (only `.env.example`). | OK | Anon keys are public by design; the real control is Supabase **Row-Level Security**, which must be verified server-side — cannot be confirmed from this repo. |
| Outline uses `dangerouslySetInnerHTML` on parser output. | Medium | The parser escapes text and KaTeX runs with `throwOnError:false`; confirm KaTeX `trust` is false (default) so `\href`/`\includegraphics` can't inject. Add a sanitizer pass or a CSP as defense-in-depth. |
| `texlyre-busytex` is **AGPL-3.0-or-later**. | Legal, high | Operating a hosted service built on it carries a source-disclosure obligation. Decide this before any commercial launch. |
| Remote package endpoint is third-party by default. | Medium | Document contents stay local, but *which packages a document loads* is observable by that host. Self-hosting (Tier 1 #2) closes this. |
| Client-side `encryptionService`. | Medium | Client-side crypto is easy to get subtly wrong; publish the threat model and key handling, or cut the feature rather than imply guarantees it can't keep. |
| No Content-Security-Policy headers. | Medium | Add a CSP in `vercel.json`; WASM needs `script-src 'wasm-unsafe-eval'`, not blanket `unsafe-eval`. |

---

## 6. Cleanup status (done vs. remaining)

**Done this session (verified: tsc, 96 unit tests, build, e2e boot+compile):**
- Removed fabricated reviewer comments, tracked changes, and version checkpoints attributed to people who don't exist (`App.tsx`).
- Neutralised the hardcoded "Neural Quantum State Tomography" project-title fallback and the `elena.rostova@teeex.io` / "Dr. Elena Rostova" author fallbacks.
- Neutralised the author placeholder in `VisualEditor.tsx`.
- Marked `remote-heavy` presets and added an honest UI notice so selecting ACM/Nature no longer silently rewrites to a class that won't compile.

**Remaining fabricated/demo content (precise, for a dedicated cleanup pass):**
- `services/projectsService.ts` — the sample project's fake member list (`usr-elena`, etc.).
- `services/collaboration.ts` — `DEFAULT_PEERS` simulated collaborators.
- `services/authService.ts` — the `usr-elena` demo identity / role seed.
- `services/templates.ts` — the default IEEE template is a fabricated quantum-physics paper with fake authors; fine as an *example template*, but it should not be the thing a brand-new empty project loads as if it were the user's own work.
- `services/developerService.ts` + demo-mode wiring in `App.tsx` — dead weight for end users.

These are interwoven with the real auth / projects / collaboration flows, so they need a focused pass (understand each flow, keep the feature, drop the fake seed) rather than a blind delete — doing it carelessly would break working features.

---

## 7. The honest bottom line

Teeex has a genuinely defensible wedge that Overleaf structurally cannot copy without rebuilding on WASM, and that typst.app cannot copy without abandoning LaTeX: **real LaTeX, locally, with a responsive live loop and preview==export fidelity.** Winning is not about more features — it's about making that core *fast, complete in packages, beautifully edited, and trustworthy*, and cutting the half-features that dilute it. Tiers 1–2 above are the path; everything is measurable, so "#1" can be proven rather than asserted.
