# NIUMA WORKS · 牛马工坊

Game Jam teams commission a playable 3D character. Monad testnet holds the order payment and distributes it across three workstations and the platform after acceptance.

Created after the organizer's start announcement for Monad Blitz Guangzhou, 2026-11-21, using create-eth 2.0.23 (Scaffold-ETH 2, Foundry).

## Current status

Stage 1A: scaffold, Monad testnet configuration (chain ID 10143), and burner wallet connector. Business contracts and generation are being implemented; no deployed contract or completed orders are claimed yet.

The generation path is FLUX.1-schnell -> TRELLIS. Uploaded GLB is the fallback. Pre-start verification code and assets are excluded.

## Development

Use Node >=20.18.3, Yarn via Corepack, and Foundry. Run `corepack yarn install`, `forge test` from `packages/foundry`, then `corepack yarn start`.

Copy `.env.example` to a private `.env` and fill the required values locally. Never publish a key or token.

## Demo limitations

Run scores are reported by the client and are not cheat resistant. Procedural motions are presets, not generated skeletal animation. Only Monad testnet is in scope.
