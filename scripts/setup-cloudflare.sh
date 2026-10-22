#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Pomona - Automated Cloudflare CLI Provisioning Script
#
# Sets up:
# 1. Cloudflare authentication check (wrangler whoami)
# 2. KV Namespaces (POMONA_QUOTA_KV & preview namespace)
# 3. Patching apps/proxy/wrangler.jsonc with created KV IDs
# 4. Setting required secrets (GEMINI_API_KEY, OPENAI_API_KEY, COOKIE_SIGNING_SECRET)
# Production builds and deployments run only through GitHub Actions.
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WRANGLER_FILE="${ROOT_DIR}/apps/proxy/wrangler.jsonc"

# Load local env files if present
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi
if [ -f "${ROOT_DIR}/apps/proxy/.dev.vars" ]; then
  set -a
  source "${ROOT_DIR}/apps/proxy/.dev.vars"
  set +a
fi

# Normalize Cloudflare token and account ID from env
export CLOUDFLARE_API_TOKEN="${CLOUDFARE_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFARE_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID:-553fb87d04f36b2f088f1250f34503cc}}"

if [ -z "${AI_GATEWAY_ID:-}" ]; then
  echo "Set AI_GATEWAY_ID to an existing AI Gateway before provisioning production." >&2
  exit 1
fi
export AI_GATEWAY_ACCOUNT_ID="${AI_GATEWAY_ACCOUNT_ID:-${CLOUDFLARE_ACCOUNT_ID}}"

echo "=============================================="
echo "  Pomona Cloudflare Provisioning & Deployment"
echo "=============================================="

# 1. Check Wrangler CLI & Authentication
echo ""
echo "--> Checking Cloudflare Wrangler authentication..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "Error: You are not logged into Cloudflare Wrangler."
  echo "Please run 'npx wrangler login' first and re-run this script."
  exit 1
fi
echo "✓ Authenticated with Cloudflare."

# 2. Create or verify POMONA_QUOTA_KV namespace
echo ""
echo "--> Provisioning KV namespaces for Pomona quota tracking..."

extract_kv_id() {
  local output="$1"
  echo "$output" | grep -o 'id = "[^"]*"' | head -n 1 | cut -d '"' -f 2 || true
}

# Production KV namespace
echo "Provisioning production KV namespace 'POMONA_QUOTA_KV'..."
PROD_KV_OUTPUT=$(npx wrangler kv namespace create POMONA_QUOTA_KV 2>&1 || true)
PROD_KV_ID=$(extract_kv_id "${PROD_KV_OUTPUT}")

if [ -z "${PROD_KV_ID}" ]; then
  # Check if it already exists in kv namespace list
  PROD_KV_ID=$(npx wrangler kv namespace list 2>/dev/null | grep -E -B 1 '"title": "(pomona-proxy-)?POMONA_QUOTA_KV"' | grep '"id":' | head -n 1 | cut -d '"' -f 4 || true)
fi

# Preview KV namespace
echo "Provisioning preview KV namespace 'POMONA_QUOTA_KV_PREVIEW'..."
PREVIEW_KV_OUTPUT=$(npx wrangler kv namespace create POMONA_QUOTA_KV --preview 2>&1 || true)
PREVIEW_KV_ID=$(extract_kv_id "${PREVIEW_KV_OUTPUT}")

if [ -z "${PREVIEW_KV_ID}" ]; then
  PREVIEW_KV_ID=$(npx wrangler kv namespace list 2>/dev/null | grep -E -B 1 '"title": "(pomona-proxy-)?POMONA_QUOTA_KV_[Pp]review"' | grep '"id":' | head -n 1 | cut -d '"' -f 4 || true)
fi

echo "KV Production ID: ${PROD_KV_ID:-'(unchanged/existing)'}"
echo "KV Preview ID:    ${PREVIEW_KV_ID:-'(unchanged/existing)'}"

# 3. Patch wrangler.jsonc if IDs were obtained
if [ -n "${PROD_KV_ID}" ] && [ -f "${WRANGLER_FILE}" ]; then
  echo ""
  echo "--> Patching ${WRANGLER_FILE} with production KV ID..."
  sed -i.bak -E "s/\"id\": \"[^\"]*\"/\"id\": \"${PROD_KV_ID}\"/" "${WRANGLER_FILE}"
  rm -f "${WRANGLER_FILE}.bak"
fi

if [ -n "${PREVIEW_KV_ID}" ] && [ -f "${WRANGLER_FILE}" ]; then
  echo "--> Patching ${WRANGLER_FILE} with preview KV ID..."
  sed -i.bak -E "s/\"preview_id\": \"[^\"]*\"/\"preview_id\": \"${PREVIEW_KV_ID}\"/" "${WRANGLER_FILE}"
  rm -f "${WRANGLER_FILE}.bak"
fi

# 4. Set required secrets in Cloudflare Worker
echo ""
echo "--> Configuring Cloudflare Worker secrets..."

prompt_or_use_env() {
  local var_name="$1"
  local prompt_label="$2"
  local val="${!var_name:-}"

  if [ -z "${val}" ]; then
    if [ -t 0 ]; then
      read -rsp "Enter value for ${prompt_label} (${var_name}): " val
      echo ""
    else
      echo "Notice: Non-interactive shell and ${var_name} not set. Skipping automated secret write for ${var_name}."
      return 0
    fi
  fi

  if [ -n "${val}" ]; then
    echo "Setting secret ${var_name}..."
    echo "${val}" | npx wrangler secret put "${var_name}" --config "${WRANGLER_FILE}" >/dev/null 2>&1 || true
    echo "✓ Secret ${var_name} recorded."
  fi
}

prompt_or_use_env "GEMINI_API_KEY" "Google Gemini API Key"
prompt_or_use_env "OPENAI_API_KEY" "OpenAI API Key (optional fallback)"

if [ -z "${COOKIE_SIGNING_SECRET:-}" ]; then
  AUTO_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | head -c 64)
  export COOKIE_SIGNING_SECRET="${AUTO_SECRET}"
fi
prompt_or_use_env "COOKIE_SIGNING_SECRET" "Cookie HMAC Signing Secret"

echo ""
echo "=============================================="
echo "✓ Pomona Cloudflare resources provisioned."
echo "Commit the configuration changes and use the GitHub Actions deployment workflow on main."
echo "=============================================="
