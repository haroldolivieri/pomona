---
name: run-local-stack
description: Use when starting, running, or troubleshooting the local Pomona development stack, Cloudflare Worker proxy, mobile tunnel, or physical device camera debugging.
---

# Run Local Stack (Pomona)

This skill guides running and troubleshooting Pomona's full local development stack, including the Vite HTTPS frontend, the Cloudflare Worker proxy, the public mobile tunnel, and physical smartphone debugging.

---

## 1. Stack Overview

| Component | Directory | Local Address | Command | Description |
|---|---|---|---|---|
| **Web App** | `apps/web` | `https://localhost:5173` | `pnpm dev` | Vite + React + Tailwind + `@vitejs/plugin-basic-ssl` |
| **Worker Proxy** | `apps/proxy` | `http://localhost:8787` | `pnpm dev:proxy` | Cloudflare Worker + Wrangler + KV Quota + Gemini/OpenAI vision |
| **Both Concurrently** | Root | Both ports above | `pnpm dev:all` | Runs web & proxy concurrently |
| **Mobile Tunnel** | Root | `https://*.trycloudflare.com` | `pnpm tunnel` | Cloudflare Quick Tunnel forwarding to port 5173 |

---

## 2. Prerequisites & Setup

1. **Node & pnpm**:
   ```bash
   pnpm install
   ```
2. **Proxy Environment Variables**:
   Create or verify `apps/proxy/.dev.vars`:
   ```bash
   cp apps/proxy/.dev.vars.example apps/proxy/.dev.vars
   ```
   Configure your keys:
   ```ini
   GEMINI_API_KEY=your_key_here
   OPENAI_API_KEY=your_key_here
   COOKIE_SIGNING_SECRET=local-development-secret-min-32-chars
   ```
3. **Cloudflare CLI (`cloudflared`)**:
   Used for physical mobile device tunneling.
   - macOS: `brew install cloudflared`
   - Linux: Download from Cloudflare GitHub releases.
   - Note: `scripts/tunnel.sh` automatically checks for system `cloudflared` and falls back to a cached download in `/tmp/cloudflared` if not found in `$PATH`.

---

## 3. Starting the Stack

### Option A: Standard Full Stack (Recommended)

1. **Terminal 1: Start Web & Proxy**
   ```bash
   pnpm dev:all
   ```
   - Web server starts at `https://localhost:5173`
   - Proxy server starts at `http://localhost:8787`

2. **Terminal 2: Start Mobile Tunnel (for smartphone testing)**
   ```bash
   pnpm tunnel
   ```
   The script outputs a public HTTPS URL (e.g., `https://random-words.trycloudflare.com`).

---

### Option B: Running Individual Services

- **Web App Only**:
  ```bash
  pnpm dev
  # or: pnpm --filter @pomona/web dev
  ```
- **Proxy Only**:
  ```bash
  pnpm dev:proxy
  # or: pnpm --filter @pomona/proxy dev
  ```
- **Evaluation Suite**:
  ```bash
  pnpm eval
  ```

---

## 4. Physical Mobile Device Testing

Mobile web browsers (Safari iOS and Chrome Android) require a valid public HTTPS origin for `navigator.mediaDevices.getUserMedia` camera permissions. Self-signed local certificates on LAN IPs (e.g. `https://192.168.x.x:5173`) are blocked by mobile security sandboxes.

### Testing on Phone via Tunnel:
1. Run `pnpm tunnel`.
2. Copy the generated `https://*.trycloudflare.com` URL.
3. Open the URL in Safari on iOS or Chrome on Android.
4. Allow camera permissions when prompted.

---

## 5. Mobile In-App Debug Tools

When testing on a physical smartphone where DevTools is not easily accessible:

1. **5-Tap Brand Secret Gesture**:
   - Rapidly tap the **"Pomona" brand pill** in the top navigation bar **5 times**.
   - This unlocks developer settings, mock scan controls, and inspection data.
2. **URL Query Param**:
   - Open the web app with `?debug=true` in the URL (e.g., `https://*.trycloudflare.com/?debug=true`).
3. **Mock Scan Mode**:
   - Useful for testing UI, multi-round flip flows, and bottom sheet parallax without consuming quota or requiring live vision API responses.

---

## 6. Troubleshooting & Common Issues

### Issue: "Tunnel cannot connect to localhost:5173" / Self-Signed SSL Error
- **Cause**: Vite runs under HTTPS using a self-signed basic-ssl certificate.
- **Solution**: `scripts/tunnel.sh` runs with `--no-tls-verify`:
  ```bash
  cloudflared tunnel --url https://localhost:5173 --no-tls-verify
  ```
  Ensure `--no-tls-verify` is present.

### Issue: Port 5173 or 8787 Already in Use
- Check running tasks or processes:
  ```bash
  lsof -i :5173
  lsof -i :8787
  ```
- Terminate stale instances:
  ```bash
  kill -9 <PID>
  ```

### Issue: Browser Warning on Desktop (`NET::ERR_CERT_AUTHORITY_INVALID`)
- Click **Advanced -> Proceed to localhost (unsafe)** once in Chrome/Edge, or accept the risk in Safari/Firefox. This is normal for `@vitejs/plugin-basic-ssl`.

### Issue: Proxy 429 Quota Exceeded During Testing
- Reset client cookies or use the dev tools menu (via the 5-tap gesture or `?debug=true`) to reset local scan quota.
