# Dry-Run Executor — Pharos Agent Arena

Live demo: https://dry-run-executor.trantanlong2411.workers.dev/

Source: https://github.com/trantanlong2411-droid/Dry-Run-Executor

## Verified live evidence

[Real read-only RPC success / revert / gas-cap test results](./proof/README.md)

GitHub Actions run 40743778145 completed successfully. The live test includes 64,513 gas units on an undoDeposit(1) preview, a blocked deposit(2) with reason INSUFFICIENT_PENDING, and a blocked gas-cap case. There was no broadcast.

## Overview

This read-only transaction preflight Skill runs on Pharos Atlantic Testnet (chain ID 688689). It uses Ethereum JSON-RPC eth_call, eth_estimateGas, eth_gasPrice and pinned-block contract-state reads to decide whether an unsigned testnet transaction could be prepared safely. It never signs, broadcasts or sends transactions. The app returns a predicted SUCCESS or REVERT and, when available, a decoded Error(string) reason, estimated gas units, estimated cost in PHRS, actual before-state and a clearly labeled projected after-state. Failed calls and gas safety policy violations are automatically BLOCKED.

## Source testnet contract (from the prior Saga Executor challenge)

Network: Pharos Atlantic Testnet (chain ID 688689)
RPC: https://atlantic.dplabs-internal.com
Deployed SagaPlayground: 0x934403227468426b33c26536dABC33b066B73f73
Public example transaction sender: 0x74B2c2E4E4B771F0C75dcE44f40787468E323f79

The known sandbox contract supports undoDeposit(uint256), deposit(uint256), compensateSwap(uint256). It uses worthless Saga test tokens, not real funds. The successful Saga Executor run left 1 deposited test share for this sender. Because live state can change, recheck before claiming a specific outcome.

## How reviewers reproduce both outcomes

1. Open the live website. Click Demo: success. This simulates undoDeposit(1), which should PASS if the sample wallet still has at least 1 deposited test share. Read-only eth_call plus eth_estimateGas allow READY_TO_PREPARE. Before: 1 deposited test share. Projected after: 0 deposited shares and 1 pending test B credit.
2. Click Prepare unsigned transaction. It only renders unsigned JSON; there is no wallet or send transaction capability, so no funds or balances change.
3. Click Demo: revert. It simulates deposit(2) with insufficient pending credit. The RPC should return an EVM revert reason such as INSUFFICIENT_PENDING; the page returns BLOCKED, without inventing an estimated gas cost.
4. Click Demo: gas cap. The EVM call may succeed but a configured zero-PHRS gas-cost cap forces BLOCKED.
5. Inspect the exact block, inputs, decoded revert, actual balances, projected changes, gas price, units and PHRS cost. Export the JSON audit with all attempts.

If the contract state or RPC changes, the successful demo may cease to pass. This is intentionally not replaced with synthetic chain data.

## Task requirement mapping

- Simulation before broadcast: eth_call with an explicit sender and EVM calldata at a pinned block, followed by eth_estimateGas when the call succeeds.
- Report predicted success/revert, decoded reason and gas: returns decoded Error(string) or Panic(uint256) when available; estimates gas on success and flags estimated gas unavailable on revert.
- Predicted before/after state: fetches pending B, deposited vault shares, test A balance, and PHRS balance at a pinned block. The after-state is a model projection from the known contract logic, not an on-chain mutation.
- Block execution when simulation fails: preparedUnsignedTransaction remains null for every failed or invalid simulation. No send or sign route exists anywhere in this application.

Important caveats: an eth_call is a point-in-time prediction, not a guarantee of future execution. The estimated cost is calculated in PHRS, not USD. No real asset transfer occurs and no transaction hash is produced by a dry-run.

## Automated verification

https://github.com/trantanlong2411-droid/Dry-Run-Executor/actions/workflows/verify.yml

The tests-build job runs deterministic unit tests and dry-run Cloudflare Worker bundling. The deployed-live job calls the actual public Worker, performs three real Atlantic read-only simulations (success, revert and gas cap) and uploads pharos-atlantic-dry-run-evidence with the dated JSON report when all checks pass.

Unit tests do not prove live RPC availability. A live job must pass before its results are claimed. If external RPC or deployed contract state changes, the live test must fail closed.

## Setup

npm install
npm test
npm run build-check
npx wrangler deploy

Cloudflare Worker name is dry-run-executor and main branch is auto-deployed via the connected GitHub Workers Builds integration.

## External references

- Dry-Run Executor task: https://pharos-agent-arena.vercel.app/tasks/dry-run-executor
- Ethereum eth_call / eth_estimateGas: https://ethereum.org/developers/docs/apis/json-rpc/
- Execution APIs and revert errors: https://ethereum.github.io/execution-apis/api/methods/eth_call/
- Pharos Atlantic network: https://www.alchemy.com/rpc/pharos-atlantic
- Pharos MCP (hosted mainnet chain ID 1672, not Atlantic): https://github.com/PharosNetwork/pharos-mcp
- Saga Executor source: https://github.com/trantanlong2411-droid/Saga_Executor
