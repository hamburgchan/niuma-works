# NIUMA WORKS · 牛马工坊

Game Jam teams commission a playable 3D character. Monad testnet holds the order payment and distributes it across three workstations and the platform after acceptance.

Created after the organizer's start announcement for Monad Blitz Guangzhou, 2026-11-21, using create-eth 2.0.23 (Scaffold-ETH 2, Foundry).

## Current status

Stage 1A is pushed. Stage 1B contract and deployment script are implemented: `forge test -vv` passes 17 tests (including 256 fuzz cases). Deployment is pending valid local credentials; no completed orders are claimed yet. See `evidence/foundry-test.txt`.

The generation path is FLUX.1-schnell -> TRELLIS. Uploaded GLB is the fallback. Pre-start verification code and assets are excluded.

## Development

Use Node >=20.18.3, Yarn via Corepack, and Foundry. Run `corepack yarn install`, `forge test` from `packages/foundry`, then `corepack yarn start`.

Copy `.env.example` to a private `.env` and fill the required values locally. Never publish a key or token.

On this workstation the environment file is `D:\monad\.env`, outside this repository. `scripts/deploy.ps1` loads it, checks chain ID 10143, and refuses to broadcast again if an earlier deployment attempt needs reconciliation. Run `pwsh -File scripts/deploy.ps1`; `-VerifyOnly` retries source verification without deploying again.

Order payments snapshot the price, recipients and split when funded. Acceptance credits withdrawable balances at 50/20/20/10; integer remainder goes to the platform. Cancellation or an eligible timeout refund credits the buyer's full original payment, then the buyer calls `withdraw()`.

## Demo limitations

Run scores are reported by the client and are not cheat resistant. Procedural motions are presets, not generated skeletal animation. Only Monad testnet is in scope.
