# NIUMA WORKS · 牛马工坊

Game Jam teams commission a playable 3D character. Monad testnet holds the order payment and distributes it across three workstations and the platform after acceptance.

Created after the organizer's start announcement for Monad Blitz Guangzhou, 2026-11-21, using create-eth 2.0.23 (Scaffold-ETH 2, Foundry).

## Current status

Stages 1–2: contract deployed on Monad testnet (10143); three newly generated characters have completed real order, delivery and acceptance. `forge test -vv` passes 17 tests (including 256 fuzz cases); see `evidence/foundry-test.txt`. Full transaction links and GLB hashes: [evidence/orders.md](evidence/orders.md).

- Contract: [`0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb`](https://testnet.monadexplorer.com/address/0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb)
- Deployment: [`0xd70b1d03a9cb0d7adc979a085c0fce451ca89d2390a0082baa5477fbf439208a`](https://testnet.monadexplorer.com/tx/0xd70b1d03a9cb0d7adc979a085c0fce451ca89d2390a0082baa5477fbf439208a)
- Verification API: 2/2 succeeded; Monadscan verified, MonadVision partial match. Exact response: `evidence/verification-response.json`.

The generation path is FLUX.1-schnell -> TRELLIS. Uploaded GLB is the fallback. Pre-start verification code and assets are excluded.

Models: [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) (Apache-2.0), [TRELLIS-image-large](https://huggingface.co/microsoft/TRELLIS-image-large) (MIT), served by [trellis-community/TRELLIS](https://huggingface.co/spaces/trellis-community/TRELLIS). Images and 3D geometry are AI generated. Game, procedural motions, product UI and production hosting are later-stage work.

## Development

Use Node >=20.18.3, Yarn via Corepack, and Foundry. Run `corepack yarn install`, `forge test` from `packages/foundry`, then `corepack yarn start`.

Copy `.env.example` to a private `.env` and fill the required values locally. Never publish a key or token.

On this workstation the environment file is `D:\monad\.env`, outside this repository. `scripts/deploy.ps1` loads it, checks chain ID 10143, and refuses to broadcast again if an earlier deployment attempt needs reconciliation. Run `pwsh -File scripts/deploy.ps1`; `-VerifyOnly` retries source verification without deploying again.

Order payments snapshot the price, recipients and split when funded. Acceptance credits withdrawable balances at 50/20/20/10; integer remainder goes to the platform. Cancellation or an eligible timeout refund credits the buyer's full original payment, then the buyer calls `withdraw()`.

## Generation service

Setup: `python -m venv .venv`, then `.venv\Scripts\python -m pip install -r scripts/requirements.txt`. It loads `D:\monad\.env` here; another location can be selected with `NIUMA_ENV_FILE`. HF_TOKEN also supports the Windows user environment. The current Blob store is public; its token remains server-side.

Start the API locally: `pwsh -File scripts/start-local.ps1`. Run the worker separately: `.venv\Scripts\python scripts/worker.py --watch`. POST `/api/orders/{orderId}/start` validates chain Funded state, the exact UTF-8 prompt's keccak256, and the buyer's signature before creating an immutable Blob queue entry. Repeated requests return the existing job. GET `/api/orders/{orderId}` reads progress and actual chain state. See [docs/generation.md](docs/generation.md) for the signing message and worker details.

The demo uses a **local worker for generation and operator delivery**. Hugging Face queue time and a multi-step GPU job can outlast a web request; generation does not run inside the Vercel request. GET is read-only. No production API deployment is claimed at this stage.

For an already funded order, run `.venv\Scripts\python scripts/generate.py --order-id ID --prompt "exact original prompt"`. For the upload fallback, add `--upload "C:\path\own.glb"`; the record is explicitly `mode: uploaded` and must be shown as “上传资产”. This fallback is implemented and malformed-file validation is tested; a separate real uploaded-asset order has not been broadcast.

Definite model errors cancel the Funded order and credit a full withdrawable refund. Unknown/connection failures hold for reconciliation, without resubmitting a GPU job or transaction. GPU claims are create-only Blob objects; local task and original transaction hashes are persisted. Do not clear those records to retry an uncertain operation.

Measured order gas costs at 102 gwei: order 0.024372492–0.026294988 MON, deliver 0.030021150–0.031945074 MON, approve 0.007858080–0.009773130 MON. These are fees in addition to the 0.01 MON commission. They use each submitted gas limit, as Monad charges on the limit.

## Demo limitations

Run scores are reported by the client and are not cheat resistant. Procedural motions are presets, not generated skeletal animation. Only Monad testnet is in scope.

Order 1 was delivered to the original private Blob store before the store switch. Its immutable chain URI remains private; the new public mirror matches the on-chain hash exactly. `/api/characters/1/asset` resolves that mirror. Orders 2–3 directly use public chain URIs. All three GLBs pass GLTFLoader geometry parsing and embedded texture decoding; browser WebGL rendering and gameplay have not been tested yet.
