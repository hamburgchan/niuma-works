# Local credential boundary

Checked 2026-11-21 after competition start.

- Git root: `D:\monad\niuma-works`.
- Credential file: `D:\monad\.env`, outside the repository.
- `git status --short --untracked-files=all` does not list the credential file.
- `git check-ignore -v --no-index .env` reports `.gitignore:26:.env* .env` for a hypothetical in-repository environment file.
- `git check-ignore ../.env` correctly rejects the path as outside the repository.
- DEPLOYER_PRIVATE_KEY, OPERATOR_PRIVATE_KEY, BUYER_PRIVATE_KEY and BLOB_READ_WRITE_TOKEN are present. Values are never included here.
- User-level HF_TOKEN is present and starts with `hf_`.
- The first credential check found public addresses in the three PRIVATE_KEY fields. Those values were not usable signing keys. No transaction was sent by that check; its initial balance output was invalid. A separate successful RPC lookup of the public addresses returned the balances below.

| Role | Public address | Monad testnet balance at check |
|---|---|---|
| Deployer | 0x88e79c388E1EaA6fc0AB876456D75037598F16e4 | 5 MON |
| Operator | 0x9A291f35836992494904Ee5De83DfAABcF7876aD | 5 MON |
| Buyer | 0xb561475586d95612121d3806A86d930d1a3d414a | 5 MON |

The user corrected all three private key fields. A fresh derivation from the corrected keys returned exactly the three public addresses above; their balances were still 5 MON each before deployment.

Chain ID is checked again before broadcast. Payouts and treasury default to the deployer address, as instructed by the user; the operator and buyer use distinct keys.
