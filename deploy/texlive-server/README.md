# Teeex — Self-Hosted TeX Live Package Server (Option C)

This lightweight caching proxy eliminates the runtime dependency on the third-party `texlive2026.texlyre.org` server.

When documents use packages beyond `texlive-basic` (e.g. `\usepackage{tikz}`, `\usepackage{amsmath}`, IEEEtran, acmart), the TeX engine resolves those files on demand. This server caches all requested packages on disk and serves them with full CORS and immutable cache headers.

---

## 1-Click / Free Tier Deployments

### Option 1: Railway.app (Free Tier — Recommended)
1. Go to [railway.app](https://railway.app) and click **New Project** -> **Deploy from GitHub repo**.
2. Select your Teeex repo and set the root directory to `deploy/texlive-server`.
3. In **Variables**, you can optionally set:
   - `PORT`: `8080` (Railway detects this automatically)
   - `UPSTREAM_URL`: `https://texlive2026.texlyre.org`
4. In **Settings** -> **Networking**, click **Generate Domain** (e.g. `https://teeex-texlive.up.railway.app`).
5. Copy your domain and set it in your frontend environment variables:
   ```env
   VITE_TEXLIVE_REMOTE_ENDPOINT=https://teeex-texlive.up.railway.app
   ```

### Option 2: Render.com (Free Tier)
1. Go to [render.com](https://render.com) -> **New Web Service**.
2. Connect your repository.
3. Settings:
   - Root Directory: `deploy/texlive-server`
   - Environment: `Docker`
   - Plan: `Free`
4. Copy the assigned URL (e.g. `https://teeex-texlive.onrender.com`) and set:
   ```env
   VITE_TEXLIVE_REMOTE_ENDPOINT=https://teeex-texlive.onrender.com
   ```

### Option 3: Fly.io (Free Tier)
1. Install flyctl: `powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"`
2. From this folder:
   ```bash
   cd deploy/texlive-server
   fly launch
   fly deploy
   ```
3. Set your endpoint in the main project:
   ```env
   VITE_TEXLIVE_REMOTE_ENDPOINT=https://your-app.fly.dev
   ```

### Option 4: Local or VPS Docker
```bash
cd deploy/texlive-server
docker compose up -d
```
Accessible locally at `http://localhost:8080`.

---

## Health Check
Verify your server is running:
```bash
curl https://your-server-url/health
# Returns: {"status":"healthy","service":"teeex-texlive-server","upstream":"https://texlive2026.texlyre.org"}
```
