# Stage 2 operations

The repository scripts and demo characters were created after the competition started. Do not copy pre-start verification artifacts into this project.

## API and signing

POST `/api/orders/{orderId}/start` takes `{ "prompt": "exact original text", "signature": "0x..." }`. The buyer signs this exact personal-sign message (no trailing newline):

```text
NIUMA WORKS start
chainId: 10143
contract: 0x8ecf351db2ea99aa32bef4ba2686fd0bfeff8abb
orderId: ID
promptHash: 0xKECCAK256_OF_EXACT_UTF8_PROMPT
```

The prompt's spelling, whitespace and Unicode are committed unchanged. A manually supplied English rendering may guide generation, but it never replaces the original chain commitment. The suffix is “single character, full body, front view, plain white background”, plus game styling and no text.

The route requires the real order buyer signature, a matching prompt hash and an unexpired Funded order. It only enqueues; no key or HF token reaches the browser. A create-only `request.json` deduplicates concurrent POSTs; a create-only `gpu-claim.json` prevents multiple workers from submitting the same job. The latter guard was added after the three initial demo generations; its conflict/no-resubmit behavior is unit-tested, not presented as a live concurrent GPU test.

GET `/api/orders/{orderId}` combines Blob progress with current on-chain state; it never sends a transaction. GET `/api/characters/{characterId}/asset` serves a registered GLB or the verified matching mirror. The demo's local worker calls `deliver`; the user subsequently signs `approve`. The team's `demo.py` additionally signs approval with the explicitly configured demo buyer key.

## Worker

Run `scripts/worker.py --watch` alongside the API. It uses the current public Blob token and testnet-only operator key. It checks the order and deadline before generating, calls FLUX `/infer`, TRELLIS `/start_session`, `/preprocess_image`, then `/generate_and_extract_glb`. It validates GLB magic, version, declared length, mesh presence and embedded dependencies, hashes the exact file, uploads and downloads it, then delivers the content hash and URI.

`scripts/generate.py` can also process a specific existing order directly. A persistent GPU attempt stops automatic reruns. Signed transactions persist their original hash and nonce before broadcast. Missing receipts require reconciliation of that hash, not a new transaction. Definite model/output failure cancels and credits a pull refund; transport uncertainty does not pretend failure or charge again. Cancellation and refund behavior are covered by contract tests; no real failure/cancellation was induced solely for testing.

The uploaded-GLB fallback uses `--upload`, the same hash validation and delivery path, and `mode: uploaded` provenance. It does not call HF. Client preview and “上传资产” UI belong to the game/frontend stage.

## Evidence

- `evidence/orders.md`: all nine real transaction links, exact hashes, byte counts and observed timings.
- `evidence/order-readback.json`: fresh Paid state, receipt status, decoded split amounts and unauthenticated public download hashes.
- `evidence/api-check.json`: real HTTP prompt/signature rejection and repeated-start deduplication on order 3.
- `evidence/api-assets.json`: GET progress and asset download hashes for all three characters, including the mirror.
- `evidence/glb-{1,2,3}.json`: GLTFLoader mesh and texture results, without claiming browser rendering.
- `evidence/blob-check.md`: small-file public token check and deletion.
- `.runtime/`: ignored local jobs, original transaction records and post-start models. This directory is not a recoverable cloud worker database; keep it during the demo.

Official references: [Gradio client](https://www.gradio.app/main/docs/python-client/client), [Vercel Blob JS](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Vercel Blob Python](https://vercel.com/docs/vercel-blob/python-sdk-reference). Public-store bytes can be downloaded without a token; read/write credentials stay local or in server environment variables.
