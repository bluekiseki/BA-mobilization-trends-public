#!/bin/bash
set -e
cd "$(dirname "$0")"

wasm-pack build --target web --out-dir pkg --release

mkdir -p ../../public/wasm
cp pkg/gacha_engine_bg.wasm ../../public/wasm/gacha_engine_bg.wasm
cp pkg/gacha_engine.js ../../app/workers/gacha_engine_pkg.js
cp pkg/gacha_engine.d.ts ../../app/workers/gacha_engine_pkg.d.ts

echo "Done: wasm → public/wasm/gacha_engine_bg.wasm, glue → app/workers/gacha_engine_pkg.js"
