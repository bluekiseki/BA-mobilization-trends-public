#!/bin/bash
# Copy mock data to the correct locations for local development.
# Run this after cloning: bash scripts/setup-mock-data.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
MOCK_DIR="$ROOT/app/data/mock"
DATA_DIR="$ROOT/app/data"

cp -r "$MOCK_DIR/jp/." "$DATA_DIR/jp/"
cp "$MOCK_DIR/livedataServer.json" "$DATA_DIR/livedataServer.json"

# Wrangler config — copy only if not already present
[ -f "$ROOT/wrangler.jsonc" ] || cp "$ROOT/wrangler.example.jsonc" "$ROOT/wrangler.jsonc"
[ -f "$ROOT/wrangler.auth.jsonc" ] || cp "$ROOT/wrangler.auth.example.jsonc" "$ROOT/wrangler.auth.jsonc"

echo "Mock data copied. The app will run with minimal placeholder data."
echo "Edit app/data/livedataServer.json to set your real domain/CDN values."
echo "Edit wrangler.jsonc and wrangler.auth.jsonc to set your Cloudflare resource IDs."
