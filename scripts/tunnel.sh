#!/usr/bin/env bash
set -euo pipefail

# Locate cloudflared binary across standard locations
CLOUDFLARED_BIN=""
if command -v cloudflared &>/dev/null; then
  CLOUDFLARED_BIN="cloudflared"
elif [ -x "/opt/homebrew/bin/cloudflared" ]; then
  CLOUDFLARED_BIN="/opt/homebrew/bin/cloudflared"
elif [ -x "/usr/local/bin/cloudflared" ]; then
  CLOUDFLARED_BIN="/usr/local/bin/cloudflared"
elif [ -x "/tmp/cloudflared" ]; then
  CLOUDFLARED_BIN="/tmp/cloudflared"
else
  echo "cloudflared binary not found in PATH or standard directories."
  echo ""
  echo "Install via Homebrew:"
  echo "  brew install cloudflared"
  echo ""
  echo "Or download standalone binary:"
  echo "  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64 -o /tmp/cloudflared && chmod +x /tmp/cloudflared"
  exit 1
fi

echo "=========================================================="
echo " Starting Cloudflare Quick Tunnel for Pomona Mobile Debug "
echo " Forwarding to local Vite HTTPS server (https://localhost:5173)"
echo "=========================================================="
echo ""
echo "Open the generated https://*.trycloudflare.com URL on your phone."
echo "Tap the 'Pomona' logo 5 times on your device to unlock dev settings."
echo ""

exec "$CLOUDFLARED_BIN" tunnel --url https://localhost:5173 --no-tls-verify
