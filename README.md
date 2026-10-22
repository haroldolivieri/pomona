# 🍊 Pomona

> **Smart, tactile produce picker and ripeness inspector.**  
> Point your camera at a grocery display, draw around your picks, or flip produce over for a multi-angle inspection. Built for mobile web and offline-capable PWA.

---

## 🌟 Key Features

- **Multi-Round Vision Inspection**:
  - **Round 1 (Wide View)**: Automatically isolates contenders, identifies produce, evaluates ripeness traits, and picks the highest-scoring item with spatial bounding boxes.
  - **Round 2 (Runner-Up Flip)**: Prompts you to flip the runner-up item over to check its underside.
  - **Round 3 (Leader Final Check)**: If the runner-up overtakes the leader, prompts you to flip the 1st pick for an unbiased final verdict.
- **Organic Freehand Loop (Polygon Focus)**:
  - Trace around a specific cluster or subset of produce with your finger.
  - The vision proxy filters candidate boxes to only evaluate produce inside your drawn loop.
- **Goal-Driven Ripeness Window**:
  - **Ready now (Peak ripe)**: Scores for eating today.
  - **In 2–3 days (Almost ripe)**: Scores for ripening at home over the next few days.
  - **Later this week (Firm / Unripe)**: Scores for batch storage.
  - **Smart Advisory Fallback**: If all items in view are already ripe, the app displays a distinct amber highlight (`#EA580C`), mismatch tag (`⚠️ Closest match · Already ripe`), and an explanatory banner instead of false-positive gold.
- **Regional Seasonality Calendar**:
  - Evaluates local vs. imported seasonality for 70+ produce varieties across UK, EU, US, Mediterranean, and Brazil (CEAGESP calendar).
  - Highlights peak months, shelf-life indicators, and optimal import origins.
- **Tactile Mobile Ergonomics**:
  - 3-position bottom sheet (`min`, `default`, `expanded`) with zero internal scrolling.
  - Synchronized live 2:1 parallax scrolling between the bottom sheet and background photo.
  - Full WCAG 2.2 AA accessibility with screen reader spatial speech (`middle row, centre, score 8.8`).

---

## 📐 Architecture & Monorepo Structure

Pomona is a pnpm monorepo using TypeScript strict mode:

```
pomona/
├── apps/
│   ├── web/           # React 19 + Vite + PWA mobile web client
│   └── proxy/         # Cloudflare Worker proxy (Gemini 2.5 Flash vision + quota KV)
├── packages/
│   ├── contract/      # Shared Zod schemas, ripeness-target resolution & seasonality tables
│   └── evals/         # Promptfoo offline vision eval dataset & contract assertions
├── scripts/
│   ├── tunnel.sh      # Cloudflare quick tunnel for physical mobile device testing
│   └── setup-cloudflare.sh  # Automated Cloudflare KV and secrets provisioning
└── .github/workflows/ # GitHub Actions CI/CD deploying to Cloudflare Workers
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** >= 10.0.0
- **Gemini API Key** (optional for local testing; mock mode is built-in)

### Installation

```bash
git clone https://github.com/haroldolivieri/pomona.git
cd pomona
pnpm install
```

### Environment Configuration

Create a `.env` file in the root (or `apps/proxy/.dev.vars` for Cloudflare Workers):

```bash
GEMINI_API_KEY=your_gemini_api_key_here
COOKIE_SIGNING_SECRET=your_32_character_random_secret_here
```

### Running the Services

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts the web app at `https://localhost:5173` (with local HTTPS cert) |
| `pnpm dev:proxy` | Starts the Cloudflare Worker proxy at `http://localhost:8787` |
| `pnpm dev:all` | Runs both the web client and worker proxy concurrently |

---

## 📱 Mobile Device Debugging (Physical Phone Testing)

Mobile browsers (iOS Safari and Android Chrome) enforce strict WebRTC / `getUserMedia` camera permissions that require a **globally trusted public HTTPS certificate**. Local self-signed certificates or plain HTTP will block camera access.

### 1. Start the Dev Server
```bash
pnpm dev
```

### 2. Start the Cloudflare Tunnel
In a second terminal, run:
```bash
pnpm tunnel
```

`pnpm tunnel` automatically detects `cloudflared` (Homebrew, `/usr/local/bin`, or `/tmp/cloudflared`) and exposes your local Vite dev server via an ephemeral Cloudflare Quick Tunnel:
```
https://<random-name>.trycloudflare.com
```

### 3. Open on Mobile
- Scan the QR code or open the `https://*.trycloudflare.com` URL in your mobile browser.
- Full camera access works immediately without certificate warnings.

### 4. Unlocking Mobile Developer Tools
Developer controls (offline mock scans, file uploads, debug latency tags) are hidden on production devices by default. To unlock them on your phone:

- **Option A (Secret Gesture)**: Rapidly tap the **"Pomona"** brand pill in the top-left corner **5 times**.
- **Option B (URL Flag)**: Append `?debug=true` to the URL.

The device state is saved to `localStorage` (`pomona-debug-device: true`) so your phone stays in debug mode across reloads.

---

## 🧪 Testing & Verification

Pomona includes automated unit tests, integration tests, LLM vision evaluations, and mobile browser end-to-end journeys:

```bash
# Run unit & integration tests across all packages
pnpm test

# Run Playwright mobile journeys (iPhone 15 viewport + axe-core WCAG AA accessibility audit)
pnpm --filter @pomona/web test:e2e

# Run TypeScript typechecks
pnpm typecheck

# Full production build
pnpm build
```

---

## ☁️ Deployment

### Automated GitHub Actions CI/CD
Every push to `main` triggers `.github/workflows/deploy.yml`:
1. Runs TypeScript typecheck.
2. Runs `@pomona/contract` and `@pomona/proxy` test suites.
3. Builds the static web client.
4. Deploys the Cloudflare Worker with embedded static assets via Wrangler.

### Production model observability

Production model requests support Cloudflare AI Gateway using the existing provider-native SDKs. Both the first inference and validation repair carry the same request ID, session ID, scan round and prompt version, with a distinct attempt number. Responses expose `X-Pomona-Request-Id` for support and trace lookup.

Configure a gateway in the production Cloudflare account, then set these repository variables for GitHub Actions deployments:

- `AI_GATEWAY_ID`: the existing gateway ID, with logging enabled.
- `AI_GATEWAY_ACCOUNT_ID`: the gateway's account ID; defaults to the deployment account.

The deployment job refuses to deploy without a gateway ID. If authenticated gateway access is enabled, store `AI_GATEWAY_TOKEN` as a Worker secret with AI Gateway Run permission. This is separate from provider API keys and the deployment token. Do not store its value in source control. The provisioning token needs AI Gateway Read/Write permissions to inspect or create gateways.

The application asks Gateway to retain metadata logs and skip request/response payload storage and caching. This provides provider, model, token counts, duration, errors and Gateway cost estimates where model pricing is available, without persisting uploaded photos or prompt/completion bodies. Optional OpenTelemetry exporters must be configured in the gateway settings; request IDs are also sent as Gateway trace IDs.

Worker observability is enabled in Wrangler configuration. Structured `model_usage` logs cover each provider attempt; `scan_usage` logs record the final application status and aggregate token usage. These events share the request ID and omit provider keys, device tokens, IP addresses, photos and prompt text. An SDK call that throws has an error event with unknown token usage; Gateway remains the source for individual HTTP attempts and any available usage data.

With both gateway identifiers unset, local development continues to call providers directly. Partial gateway configuration is rejected. Once Gateway routing is configured, provider errors never cause a silent direct-provider fallback. Production deployment runs only through GitHub Actions on main, using the configured repository variables.

### Manual Provisioning
To provision Cloudflare KV namespaces and configure secrets:
```bash
bash scripts/setup-cloudflare.sh
```

This provisions resources and secrets only. Commit generated configuration changes, then deploy through the GitHub Actions workflow on main. Deployment messages include the app version and change description.

---

## 📄 License

MIT © [Harold Olivieri](https://github.com/haroldolivieri)
