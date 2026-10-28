---
name: pharos-dry-run-executor
description: Predict Pharos Atlantic testnet transaction outcome with eth_call, eth_estimateGas, pinned-block state reads, revert explanations and gas-cost guard, without broadcasting.
---

# Dry-Run Executor Skill

1. Verify testnet chain ID 688689 using eth_chainId before any call. Read current block number, gasPrice and contract code.
2. Validate sender address, SagaPlayground contract address, method and positive amount. Use public known testnet contract; do not request keys or connect wallets.
3. Read pending and deposited vault balances, test A token balance and native PHRS at the pinned block.
4. Execute eth_call with the desired sender and calldata at that block. Decode revert Error(string) and Panic(uint256) when possible.
5. On revert, set predicted success false, BLOCKED, no projected after-state, no gas estimate and no unsigned payload.
6. On call success, estimate gas without submission. Multiply gas units by gas price to show cost in PHRS, include a configurable buffer and block preparation when estimated gas, buffered cost or native balance breaches configured limit.
7. Show before-state and projected after-state for undoDeposit, deposit or compensateSwap using published known SagaPlayground logic. The projection is NOT a post-transaction chain observation.
8. Only prepare an unsigned transaction JSON when all guards pass; never sign or broadcast. Every attempt logs its final decision and can be exported.
9. Run unit tests plus live Worker proof from GitHub Actions. Evidence from mocks is not proof of live chain simulation.

Hosted Pharos MCP at https://mcp.pharos.xyz/mcp is mainnet 1672. This Skill deliberately uses read-only Pharos Atlantic RPC (chain 688689).
