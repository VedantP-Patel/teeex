# Teeex Studio — Real-Time Collaborative LaTeX Platform

> Ultra-fast, zero-bloat collaborative LaTeX studio with instantaneous live preview, sub-second compilation diagnostics, smart error fixes, Supabase cloud persistence, AI Copilot, and multiplayer co-authoring.

---

## ⚡ Performance & Anti-AI-Slop Architecture

Designed with a bespoke obsidian editorial aesthetic (inspired by Linear, JetBrains Fleet, and Typst), optimized for lightning-fast deployment on Vercel:

- **Ultra-Lightweight Bundle:** <235 kB gzipped total bundle size with zero runtime bloat (builds in ~615ms).
- **Instant Client-Side Typesetting:** Native KaTeX math compilation running at 60fps with zero network requests.
- **Real-Time Cross-Tab Synchronization:** Zero-latency collaborative typing & peer presence via BroadcastChannel and CRDT.
- **Sub-Second Diagnostics:** Translates cryptic LaTeX error logs into human-readable messages with **1-click automatic code fixes**.
- **Publication-Grade Preview:** Two-column IEEE/ACM paper rendering with authentic serif typography, formula blocks, and tables.

---

## 🚀 Key Features

### 1. Multiplayer Live Collaboration & Sync
- Real-time room sharing with unique URLs (`?room=xyz`).
- Animated multiplayer cursor carets with peer name tags and distinct colors.
- Live presence counter and participant status.

### 2. Supabase Cloud Integration
- Connect any Supabase project via URL + Anon Key (or test with 1-click **Demo Cloud Mode**).
- Cloud project persistence and global real-time channels across separate devices and locations.

### 3. AI LaTeX Copilot & Equation Doctor (`Ctrl+K`)
- **Math & Equations Generator**: Natural language description to KaTeX math formulas.
- **TikZ Vector Diagrams**: Generates clean `\begin{tikzpicture}` code for neural networks, commutative diagrams, and circuits.
- **Error Doctor**: Analyzes compile errors and outputs automated code fix patches.
- **Academic Prose Polisher**: Refines informal drafting into publication-grade academic English.

### 4. Figure & Asset Manager
- Drag-and-drop PNG, JPG, SVG, and WebP figures.
- Scale slider (`\linewidth`), caption input, and automatic `\includegraphics` code insertion.
- Live rendering of figures directly in the publication paper preview sheet.

### 5. Bi-directional SyncTeX & Inline Review Comments
- **SyncTeX Navigation**: Click any section heading or equation in the preview to jump straight to its source line in the code editor.
- **Google Docs-Style Inline Comments**: Margin chips and thread bubbles allowing co-authors to leave notes and mark them as resolved.

### 6. Visual Table Builder & LaTeX Symbol Palette
- Spreadsheet-like GUI grid to configure rows, columns, alignments (`L`, `C`, `R`), and borders (`\hline`).
- Searchable library of 500+ LaTeX symbols (Greek letters, operators, calculus integrals, arrows).

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
