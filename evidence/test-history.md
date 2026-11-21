# Foundry validation history

2026-11-21 10:52 Asia/Shanghai: first `forge test --match-contract NiumaWorksTest -vv`:
`5 passed; 11 failed; 0 skipped (16 total tests)`.

The first helper called `desk.characterPrice()` after `vm.prank(buyer)`, consuming the one-call prank before `order`. Observed failures included `OnlyBuyer()` and the character owner being the test contract rather than buyer. Fix: read the price before applying the prank. Fuzz setup also now funds the synthetic buyer for the full uint96 input range; assertions and production authorization were retained.

Initial fuzz seed: `0xb2af46ca99320822b943d3aa375b48a5224c62f9aa799e07f686be125f003610`.

The starter test had wildcard imports that caused a duplicate `console` preprocessor warning. Named imports resolve the warning without changing that test's assertion.

Subsequent complete outputs are saved separately; the original failed result is not treated as a pass.

## Worker checks

The first worker-test run encountered Windows access denial in the system temporary directory (2 errors); raw output is in `worker-tests-first-attempt.txt`. Test fixtures now stay in the ignored workspace `.runtime` directory. The second run hit a test fixture constructor error: current Web3's `TransactionNotFound` requires a message (1 error); raw output is in `worker-tests-second-attempt.txt`. That test fixture was corrected without changing the recovery assertions. The subsequent four checks pass in `worker-tests.txt`.

Initial TypeScript checking exposed string network keys from JSON in the ABI exporter. It now emits numeric `10143` keys compatible with Scaffold-ETH's types. Formatting checks were applied before the successful lint run.
