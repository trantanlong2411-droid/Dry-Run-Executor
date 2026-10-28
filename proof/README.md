# Dry-Run Executor — independently tested on Pharos Atlantic

Proof date: 2026-10-28 UTC (2026-10-29 in Vietnam).

Public demo: https://dry-run-executor.trantanlong2411.workers.dev/

GitHub Actions verified live run: https://github.com/trantanlong2411-droid/Dry-Run-Executor/actions/runs/40743778145

Source code: https://github.com/trantanlong2411-droid/Dry-Run-Executor

## Results confirmed by live deployed-worker requests

All three scenarios were executed as **read-only JSON-RPC simulations on the public Cloudflare Worker**, not synthetic RPC fixtures.

| Scenario | Pinned block | Decision | Evidence |
| --- | ---: | --- | --- |
| undoDeposit(1) | 31,995,844 | READY_TO_PREPARE | eth_call passed; eth_estimateGas returned 64,513 gas units; a properly guarded unsigned tx was prepared. |
| deposit(2) | 31,995,845 | BLOCKED | eth_call reverted with decoded reason INSUFFICIENT_PENDING; gas estimate unavailable; unsigned tx null. |
| undoDeposit(1), max gas cost 0 | 31,995,845 | BLOCKED | EVM call passed; gas policy blocked before preparing unsigned transaction. |

### Observed and hypothetical contract state

Sample public sender: 0x74B2c2E4E4B771F0C75dcE44f40787468E323f79

SagaPlayground: 0x934403227468426b33c26536dABC33b066B73f73

At the successful simulation pinned block:

- Actual pending test B: 0
- Actual deposited test shares: 1
- Predicted pending test B after undoDeposit(1): 1
- Predicted deposited shares after undoDeposit(1): 0

The predicted after-state is **not an observed on-chain change**. No transaction was sent, signed or mined, and no receipt or transaction hash was generated. This explicitly meets the dry-run requirement without spending test funds.

The native PHRS balance and gas price were read from testnet RPC. Estimated gas cost is shown in PHRS; no unverified PHRS/USD pricing is used. A revert cannot reliably yield a normal successful gas estimate, so the app shows unavailable instead of a fabricated fee.

### Verification

- Unit tests: 11 passed, 0 failed.
- Cloudflare production build: SUCCESS.
- Live deployed Worker success: PASS.
- Live deployed Worker revert reason: PASS.
- Gas-policy block: PASS.
- Live CI artifact: **pharos-atlantic-dry-run-evidence**, containing timestamped live-dry-run.json, available in the GitHub Actions run (retention 30 days).

Reviewers can reproduce by opening the demo and pressing **Demo: success**, **Demo: revert**, then **Demo: gas cap** and downloading browser audit via **Export JSON evidence**.

Note: the positive result depends on on-chain sandbox state. If that state changes in the future, redo the live simulation and use the latest evidence instead of asserting a guaranteed future success.

## Source standards

- https://ethereum.org/developers/docs/apis/json-rpc/
- https://ethereum.github.io/execution-apis/api/methods/eth_call/
- https://www.alchemy.com/rpc/pharos-atlantic
