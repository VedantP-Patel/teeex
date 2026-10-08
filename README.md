# Teeex Studio — Real-Time Collaborative LaTeX Platform

> Ultra-fast, zero-bloat collaborative LaTeX studio with instantaneous live preview, sub-second compilation diagnostics, smart error fixes, and multiplayer co-authoring.

---

## ⚡ Performance & Anti-AI-Slop Architecture

Designed with a bespoke obsidian editorial aesthetic (inspired by Linear, JetBrains Fleet, and Typst), optimized for lightning-fast deployment on Vercel:

- **Ultra-Lightweight Bundle:** <170 kB gzipped total bundle size with zero runtime bloat.
- **Instant Client-Side Typesetting:** Native KaTeX math compilation running at 60fps with zero network requests.
- **Real-Time Cross-Tab Synchronization:** Zero-latency collaborative typing & peer presence via BroadcastChannel and CRDT.
- **Sub-Second Diagnostics:** Translates cryptic LaTeX error logs into human-readable messages with **1-click automatic code fixes**.
- **Publication-Grade Preview:** Two-column IEEE/ACM paper rendering with authentic serif typography, formula blocks, and tables.

---

## 🚀 Key Features

1. **Multiplayer Live Collaboration:**
   - Real-time room sharing with unique URLs (`?room=xyz`).
   - Animated multiplayer cursor carets with peer name tags and distinct colors.
   - Live presence counter and participant status.
2. **Visual Table & Matrix Builder:**
   - Spreadsheet-like GUI grid to configure rows, columns, alignments (`L`, `C`, `R`), and borders (`\hline`).
   - Generates clean, ready-to-use LaTeX code directly into your document.
3. **LaTeX Math & Symbol Palette:**
   - Searchable library of 500+ LaTeX symbols (Greek letters, operators, calculus integrals, arrows).
   - Instant search and 1-click code insertion.
4. **Smart Diagnostic Linter & One-Click Fixes:**
   - Detects unclosed environments (`\begin{equation}` without matching `\end{equation}`).
   - Flags unescaped `%` or unclosed inline math `$`.
   - 1-click **"Apply Fix"** patches the document immediately.
5. **Starter Template Hub:**
   - IEEE Conference Paper (2-column format).
   - Academic Curriculum Vitae (CV / Resume).
   - Academic Presentation Deck (Beamer slides).

---

## 🛠️ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Build optimized production bundle
npm run build
```

---

## 🌐 Deploy to Vercel

```bash
npx vercel
```
*The included `vercel.json` automatically configures Vite framework routing and 1-year immutable caching for static assets.*
