# Demo faucet

Monad testnet only (10143). The deployer wallet funds browser burner wallets with 0.03 MON once per address. IP allowance is 60 new claims per hour; the total reserved budget stays at 0.9 MON (30 addresses). Existing addresses return their original transaction, without another transfer.

The server verifies the burner signature, rejects contract addresses, reserves budget and original transaction hash/nonce durably before broadcast, and uses ETag conditional writes. Each control version has an immutable JSON snapshot so public Blob CDN caching cannot turn a stale ledger into a fresh reservation. Conditional-write conflicts retry a read; unknown broadcast results only reconcile the original hash.

IP addresses are HMACed with the server key; raw IPs and secrets are not written to Blob. Only Vercel's forwarded IP is used in production. Local tests share a fixed development bucket. `FAUCET_ENABLED=false` disables new transfers. `FAUCET_PRIVATE_KEY` is optional; otherwise the server uses the configured `DEPLOYER_PRIVATE_KEY`.

Play UI says one shift is approximately 0.0096 MON including gas, so one claim covers approximately three shifts. Actual cost varies with contract state and gas. Gas is explicitly 21,000 for faucet native transfers; finishRun estimates plus 10%.
