# Autorail contracts · QDay Aevum testnet. `make help` lists targets.
# Fork/deal approach based on Aevum Starter Kit (MIT, PQA Labs).
SHELL := /bin/bash
.DEFAULT_GOAL := help
export PATH := $(HOME)/.foundry/bin:$(HOME)/.local/bin:$(PATH)
# macOS make runs simple recipes without a shell, so resolve tool paths explicitly.
FORGE := $(or $(shell command -v forge 2>/dev/null),$(HOME)/.foundry/bin/forge)
CAST  := $(or $(shell command -v cast 2>/dev/null),$(HOME)/.foundry/bin/cast)
ANVIL := $(or $(shell command -v anvil 2>/dev/null),$(HOME)/.foundry/bin/anvil)
PNPM  := $(or $(shell command -v pnpm 2>/dev/null),$(HOME)/.local/bin/pnpm)

AEVUM_RPC  ?= https://rpc-test.qday.info
FORK_PORT  ?= 8555
FORK_RPC   ?= http://127.0.0.1:$(FORK_PORT)
FORK_CHAIN := 440050
TUSD8      := 0x456569838f1d43009A91ebA4263147Afd7233483
TUSD8_MM   := 0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1
# Load contracts/.env into the environment (keys are never echoed)
ENV        := set -a; [ -f .env ] && source ./.env; set +a;
# Use a Foundry keystore with ACCOUNT=<name>, else DEPLOYER_PRIVATE_KEY from .env
SIGNER     = $(if $(ACCOUNT),--account $(ACCOUNT) --sender $$($(CAST) wallet address --account $(ACCOUNT)),)
SCRIPT     = $(FORGE) script --legacy --slow --broadcast

.PHONY: help install build check-shanghai-strict test test-fork coverage fmt lint fork deal fund-fork \
        deploy-fork register-agents-fork e2e-fork rehearse deploy-aevum register-agents-aevum fund-aevum \
        e2e-aevum recycle-fork recycle-aevum check-deployment probe

help: ## Show this list
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-24s %s\n", $$1, $$2}'

install: ## Install the pinned Solidity libs (see foundry.lock) and script deps
	$(FORGE) install --no-git foundry-rs/forge-std@v1.17.0 OpenZeppelin/openzeppelin-contracts@v5.4.0 OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0
	$(PNPM) install

build: ## forge build + Shanghai opcode check (reachability-aware)
	$(FORGE) build
	node tools/check-shanghai-reachable.mjs out

check-shanghai-strict: build ## The kit's unchanged linear checker (flags one via-IR data byte in ERC-8004; see docs/CHAIN.md)
	node tools/check-shanghai.mjs out

test: ## Unit, fuzz, invariant and demo tests (no network)
	$(FORGE) test --no-match-path 'test/fork/*'

test-fork: ## Fork tests against the REAL tUSD8 on Aevum (no funds needed)
	$(FORGE) test --match-path 'test/fork/*' --fork-url $(AEVUM_RPC)

coverage: ## Line coverage on src/ (vendored ERC-8004 code excluded)
	$(FORGE) coverage --ir-minimum --no-match-path 'test/fork/*' --no-match-coverage '(test/|script/|src/erc8004/)' --report summary

fmt: ## Format check
	$(FORGE) fmt --check

lint: ## forge lint (static analysis)
	$(FORGE) lint src

# ─────────────── local fork rehearsal (free) ───────────────

fork: ## Local copy of Aevum on 127.0.0.1:8555, chain 440050, Shanghai rules
	$(ANVIL) --fork-url $(AEVUM_RPC) --hardfork shanghai --chain-id $(FORK_CHAIN) --port $(FORK_PORT)

deal: ## Fork only: give TO AMOUNT tUSD8 and 10 tQDAY
	@test -n "$(TO)" || (echo "Usage: make deal TO=0x... [AMOUNT=100]" && exit 1)
	@test "$$($(CAST) chain-id --rpc-url $(FORK_RPC))" = "$(FORK_CHAIN)" || (echo "This only works on 'make fork'." && exit 1)
	@$(CAST) rpc anvil_setBalance $(TO) 0x8ac7230489e80000 --rpc-url $(FORK_RPC) > /dev/null
	@$(CAST) rpc anvil_impersonateAccount $(TUSD8_MM) --rpc-url $(FORK_RPC) > /dev/null
	@$(CAST) rpc anvil_setBalance $(TUSD8_MM) 0x56BC75E2D63100000 --rpc-url $(FORK_RPC) > /dev/null
	@$(CAST) send $(TUSD8) "configureMinter(address,uint256)" $(TUSD8_MM) 1000000000000000 --from $(TUSD8_MM) --unlocked --rpc-url $(FORK_RPC) > /dev/null
	@$(CAST) send $(TUSD8) "mint(address,uint256)" $(TO) $$($(CAST) parse-units $${AMOUNT:-100} 6) --from $(TUSD8_MM) --unlocked --rpc-url $(FORK_RPC) > /dev/null
	@echo "fork: $(TO) holds $$($(CAST) call $(TUSD8) 'balanceOf(address)(uint256)' $(TO) --rpc-url $(FORK_RPC)) tUSD8 units"

fund-fork: ## Fork: deal the deployer 10 tUSD8, then run Fund.s.sol
	@$(ENV) $(MAKE) -s deal TO=$$DEPLOYER_ADDRESS AMOUNT=10
	@$(ENV) $(SCRIPT) script/Fund.s.sol --rpc-url $(FORK_RPC)

deploy-fork: ## Fork: deploy everything
	@test "$$($(CAST) chain-id --rpc-url $(FORK_RPC))" = "$(FORK_CHAIN)" || (echo "Start 'make fork' first." && exit 1)
	@$(ENV) $(SCRIPT) script/Deploy.s.sol --tc Deploy --rpc-url $(FORK_RPC)
	node scripts/write-deployment.mjs $(FORK_CHAIN)

register-agents-fork: ## Fork: register the 5 agents on ERC-8004 and assign roles
	@$(ENV) $(SCRIPT) script/RegisterAgents.s.sol --rpc-url $(FORK_RPC)
	node scripts/write-deployment.mjs $(FORK_CHAIN)

e2e-fork: ## Fork: run the 12-step end-to-end demo (TypeScript)
	@$(ENV) $(PNPM) exec tsx scripts/e2e/run.ts --network fork $(E2E_FLAGS)

rehearse: ## Fork: fund → deploy → register → e2e, from a fresh `make fork`
	$(MAKE) fund-fork deploy-fork register-agents-fork e2e-fork

recycle-fork: ## Fork: sweep funds back to the deployer
	@$(ENV) $(SCRIPT) script/Recycle.s.sol --rpc-url $(FORK_RPC)

# ─────────────── Aevum testnet (real funds) ───────────────

probe: ## Deploy the tiny Shanghai probe contract to Aevum
	@$(ENV) $(SCRIPT) script/Probe.s.sol --tc Probe --rpc-url $(AEVUM_RPC)

fund-aevum: ## Aevum: idempotent tQDAY/tUSD8 top-ups from the deployer
	@$(ENV) $(SCRIPT) script/Fund.s.sol --rpc-url $(AEVUM_RPC)

deploy-aevum: ## Aevum: deploy everything (ACCOUNT=<keystore> optional)
	@$(ENV) $(SCRIPT) script/Deploy.s.sol --tc Deploy --rpc-url $(AEVUM_RPC) $(SIGNER)
	node scripts/write-deployment.mjs 44005

register-agents-aevum: ## Aevum: register the 5 agents and assign roles
	@$(ENV) $(SCRIPT) script/RegisterAgents.s.sol --rpc-url $(AEVUM_RPC) $(SIGNER)
	node scripts/write-deployment.mjs 44005

e2e-aevum: ## Aevum: run the 12-step end-to-end demo
	@$(ENV) $(PNPM) exec tsx scripts/e2e/run.ts --network aevum $(E2E_FLAGS)

recycle-aevum: ## Aevum: sweep demo funds back to the deployer
	@$(ENV) $(SCRIPT) script/Recycle.s.sol --rpc-url $(AEVUM_RPC)

check-deployment: ## Prove the deployment over RPC (code hashes, wiring, roles). NETWORK=aevum|fork
	@$(ENV) $(PNPM) exec tsx scripts/check-deployment.ts --network $${NETWORK:-aevum}
