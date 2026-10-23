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

---

## Security & Deployment Constraints

The package proxy is hardened with defensive controls to protect host infrastructure and cached assets:
- **Method Whitelist**: Only `GET`, `HEAD`, and `OPTIONS` requests are accepted. All other methods return `405 Method Not Allowed` with an explicit `Allow` header.
- **Path Sanitization & Traversal Prevention**: Raw URL path segments are validated before normalisation to block encoded dot traversals (`%2e%2e`, `..`), backslashes (`\`, `%5c`), NUL bytes (`%00`), and carriage returns/newlines (`\r`, `\n`). Paths that resolve outside the designated cache directory root are rejected with `400 Bad Request`.
- **HTTPS Upstream Enforcement**: The proxy requires an HTTPS upstream URL (`UPSTREAM_URL`) to prevent insecure man-in-the-middle package substitution.
- **Payload Limits & Timeouts**: Imposes a 15-second upstream request timeout and a 64 MiB maximum package size limit (enforced on both advertised `Content-Length` and streamed byte counts).
- **Atomic Cache Writes & Resilience**: Cache misses are streamed directly to the client while writing to a uniquely named temporary file. The file is atomically renamed into the cache hierarchy only after a complete write. Disk I/O failures are treated as best-effort so cache write issues do not drop a valid upstream response.
- **Security Headers**: All responses include `X-Content-Type-Options: nosniff` and `X-Cache: HIT` / `X-Cache: MISS` headers.

> [!CAUTION]
> **Deployment Boundary**:
> This service functions as a public package proxy, not an authenticated compilation service.
> - Always run behind an HTTPS-terminating reverse proxy (Cloudflare, Railway, Caddy, or Nginx) in production.
> - Permissive CORS headers (`Access-Control-Allow-Origin: *`) are designed for browser package downloads and do not provide access control or document security.

