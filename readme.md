# Yuzu Trends Code Repositories

> A fan-made database for mobile game \"Blue Archive\" developed by Nexon Games

All copyright of <a href='https://bluearchive.jp/' target="_blank" rel="noopener noreferrer"><b className='hover:underline'>"Blue Archive"</b></a> belongs to <a href='https://www.nexon.com' target="_blank" rel="noopener noreferrer"><b className='hover:underline'>NEXON Korea Corp.</b></a>, <a href='https://www.nexongames.co.kr/' target="_blank" rel="noopener noreferrer"><b className='hover:underline'>NEXON GAMES Co., Ltd.</b></a>, and <a href="https://www.yo-star.com" target="_blank" rel="noopener noreferrer"><b className='hover:underline'>YOSTAR, Inc.</b></a>

## Notice

- Some data from `/public` and `/app/data/` was not included in the repository.
- The code is updated manually and may differ from the actual live service

## Requirements

- Vite 7 + React Router v8 (Remix renamed since v7 in November 2024) + \*.tsx + Tailwind CSS. Deploying in a Cloudflare Workers environment

## Setup

### Prerequisites

- Node.js >= 24
- `pnpm`
- Rust nightly toolchain
- Rust target: `wasm32-unknown-unknown`
- `wasm-pack` 0.13.1

### Local Development

```bash
# First time after cloning
chmod +x ./scripts/setup-mock-data.sh
chmod +x ./wasm/gacha-engine/build.sh
./scripts/setup-mock-data.sh
./wasm/gacha-engine/build.sh

pnpm install
pnpm react-router typegen
pnpx wrangler types

pnpm copy-ort-wasm
pnpm dev:cdn
```

## Q&A

- Q. Why was obfuscation used?
- A. Since it is operated by free hosting, it is to reduce debugging and server costs. If you want to debug, clone this repository and run it locally using the setup instructions above.
