# Real post-start character orders

Read back at 2026-11-21T03:17:22.549725+00:00, Monad testnet 10143.

All descriptions: **NIUMA WORKS 团队自拟**. All models were freshly generated after the competition started. No pre-start script, image or sample GLB was copied into this repository.

| orderId / characterId | Description | order | deliver | approve |
|---|---|---|---|---|
| 1 / 1 | 一个戴着黄色安全帽、扛着扳手的胖土豆工人 | [order](https://testnet.monadexplorer.com/tx/0x3a99be8c11dae977fdf740e3ce22b4875755d0aa6eec9f9741510ba39502d3bf) | [deliver](https://testnet.monadexplorer.com/tx/0x83dd442c16d222fd8104672b95b706ed6f265d22a95c517c3cd23c988cd6605c) | [approve](https://testnet.monadexplorer.com/tx/0x502b91f3f9a18b51cbdc835cd93be1b7e5348d4f3c7c5a610d4cdb3487bbb20e) |
| 2 / 2 | 一只穿着宇航服、表情呆滞的柴犬 | [order](https://testnet.monadexplorer.com/tx/0x3c518182e903013a52d151c71fd97f08ca824b0717740852872e5c1299066249) | [deliver](https://testnet.monadexplorer.com/tx/0x135702985946440d3b305db88d744d835cde6d43dafeee8c6fd7e65681eef7f5) | [approve](https://testnet.monadexplorer.com/tx/0xabf41afc20853d5e96281b01c961be76fb3f83ff1f4b7913e874bc16b20f8f45) |
| 3 / 3 | 一个背着书包、头顶冒热气的小包子 | [order](https://testnet.monadexplorer.com/tx/0xc4b70e5b1ac853d3727186fe0ce83b8c8b5b0aafba39f7f02433f8d4835e8a1e) | [deliver](https://testnet.monadexplorer.com/tx/0x2f53a9a5626990801687adacaa3430561faf0a7b4948d64f560ff66943d58a4a) | [approve](https://testnet.monadexplorer.com/tx/0x835966121cfb1b6f7a0eca92f27dfa34dc2ad0c8f73c76f65c1ea54582eb4752) |

| orderId | GLB SHA-256 (public re-download = chain) | Bytes | FLUX / TRELLIS seconds |
|---|---|---|---|
| 1 | `b4bd053694f48fc7dfb139d03b2f2a4adee6eaa77deb1d188a4789525b8e895d` | 1241632 | 5.231 / 50.397 |
| 2 | `3e1a5353ce437259f486d208f2335705b7e5b89038af42c773a7aa0239fb3502` | 1986368 | 9.739 / 62.516 |
| 3 | `69ef13725922649b1b4a4ace9731ea683678eb0e0f0543887e3583a7651887b9` | 1499960 | 6.12 / 42.079 |

Each Paid event carries 0.005 / 0.002 / 0.002 / 0.001 MON. As explicitly requested, all four recipients are currently the deployer; three orders credit its withdrawable balance by 0.03 MON total. These are balances, not four external transfer transactions.

Order 1's original on-chain URI points to the old private store. Its public mirror contains exactly the same bytes/SHA-256. Orders 2 and 3 directly register the new public store URLs. The application asset route resolves order 1 via its matching mirror; the chain history is unchanged.

Timings include each Space call, queue/network and downloads (TRELLIS includes preprocessing). They are observed runs, not an SLA. Models have no skeletal animation; procedural game motion belongs to the later game stage.
