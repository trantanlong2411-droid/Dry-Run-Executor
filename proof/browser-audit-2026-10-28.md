# Browser audit — Dry-Run Executor — 28 October 2026

Evidence: user-exported browser log `pharos-dry-run-1793211686613.json`. Original file SHA-256: `d6e0b87ac81d265c54b45f734ff6a80064e230e3bddfc73407a580966dc569e5`. This derived summary is based on user-provided data, not an independently authenticated historical RPC capture. Separate genuine testnet validation is in [GitHub Actions](https://github.com/trantanlong2411-droid/Dry-Run-Executor/actions).

| Run | Result | Explanation |
| --- | --- | --- |
| undoDeposit(1) | READY_TO_PREPARE | Gas 64,513 units; expected vault shares 1 → 0 and pending 0 → 1 |
| deposit(2) | BLOCKED | EVM revert, `INSUFFICIENT_PENDING` |
| undoDeposit(1), gas cap 0 | BLOCKED | Simulated call can pass, but policy disallows gas spending |
| undoDeposit(1) | ERROR (historical UI said BLOCKED) | Pharos upstream RPC HTTP 429; **not** an EVM revert |
| undoDeposit(1) | READY_TO_PREPARE | Gas 64,513 units |

Five scans, two READY_TO_PREPARE and three blocked/error outcomes. No transaction signing or blockchain broadcast.

The testnet gas price recorded was 10 Gwei; estimated gas cost for the success case is 0.00064513 PHRS, buffered limit 77,416 units. These are estimates, not paid gas.

The earlier UI incorrectly placed `Pharos RPC HTTP 429` in `revertReason`. The fix correctly labels provider rate limiting as `RATE_LIMIT` / `ERROR_BLOCKED`, leaves `revertReason = null`, disables unsigned preparation, and offers a retry cooldown. This does not rewrite the original exported audit.

[Structured summary](./browser-audit-2026-10-28.json)

The real CI test independently validates a successful undoDeposit dry-run, an EVM-reverted deposit simulation and the gas-cap block using the public Pharos Atlantic RPC, without creating a mined transaction.
