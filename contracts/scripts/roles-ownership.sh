#!/usr/bin/env bash
# Ownable2Step transfer of ONLY AutorailRoles between the deployer and the ROLES_OPERATOR key.
# Every other contract (vault, registry, facility, factory, router) stays owned by the deployer.
#
#   scripts/roles-ownership.sh status                 # read-only: owner / pendingOwner
#   scripts/roles-ownership.sh to-operator            # deployer: transferOwnership(ROLES_OPERATOR)   (step 1 of 2)
#   scripts/roles-ownership.sh accept-operator        # operator: acceptOwnership()                    (step 2 of 2)
#   scripts/roles-ownership.sh back-to-deployer       # operator: transferOwnership(DEPLOYER)          (step 1 of 2)
#   scripts/roles-ownership.sh accept-deployer        # deployer: acceptOwnership()                    (step 2 of 2)
#
# Network: Aevum (44005) by default; set RPC=http://127.0.0.1:8555 for the local fork.
# Rehearse on a fresh fork against the forked Aevum contracts:
#   RPC=http://127.0.0.1:8555 DEPLOYMENT=deployments/44005.json scripts/roles-ownership.sh <cmd>
# Keys come from contracts/.env and are never printed. Legacy transactions (Aevum).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
. ./.env
set +a

RPC="${RPC:-${AEVUM_RPC_URL:-https://rpc-test.qday.info}}"
CHAIN_ID="$(cast chain-id --rpc-url "$RPC")"
# DEPLOYMENT overrides the file, e.g. DEPLOYMENT=deployments/44005.json on a fresh fork to rehearse against
# the forked Aevum contracts.
if [ -z "${DEPLOYMENT:-}" ]; then
  case "$CHAIN_ID" in
    44005) DEPLOYMENT=deployments/44005.json ;;
    440050) DEPLOYMENT=deployments/440050.json ;;
    *) echo "unexpected chain $CHAIN_ID" >&2; exit 1 ;;
  esac
fi
ROLES="$(node -e "console.log(require('./$DEPLOYMENT').contracts.AutorailRoles.address)")"
: "${DEPLOYER_ADDRESS:?missing in .env}" "${ROLES_OPERATOR_ADDRESS:?missing in .env}"

owner() { cast call "$ROLES" 'owner()(address)' --rpc-url "$RPC"; }
pending() { cast call "$ROLES" 'pendingOwner()(address)' --rpc-url "$RPC"; }
send() { # send <private-key-var-name> <sig> [args...]
  local keyvar=$1; shift
  cast send "$ROLES" "$@" --private-key "${!keyvar}" --rpc-url "$RPC" --legacy | grep -E '^(status|transactionHash|blockNumber)'
}
show() {
  echo "chain $CHAIN_ID · AutorailRoles $ROLES"
  echo "owner         $(owner)"
  echo "pendingOwner  $(pending)"
  echo "deployer      $DEPLOYER_ADDRESS"
  echo "operator      $ROLES_OPERATOR_ADDRESS"
}
lc() { tr '[:upper:]' '[:lower:]' <<<"$1"; }

case "${1:-status}" in
  status) show ;;
  to-operator)
    [ "$(lc "$(owner)")" = "$(lc "$DEPLOYER_ADDRESS")" ] || { echo "deployer is not the owner"; exit 1; }
    send DEPLOYER_PRIVATE_KEY 'transferOwnership(address)' "$ROLES_OPERATOR_ADDRESS"; show ;;
  accept-operator)
    [ "$(lc "$(pending)")" = "$(lc "$ROLES_OPERATOR_ADDRESS")" ] || { echo "operator is not pendingOwner (run to-operator first)"; exit 1; }
    send ROLES_OPERATOR_PRIVATE_KEY 'acceptOwnership()'; show ;;
  back-to-deployer)
    [ "$(lc "$(owner)")" = "$(lc "$ROLES_OPERATOR_ADDRESS")" ] || { echo "operator is not the owner"; exit 1; }
    send ROLES_OPERATOR_PRIVATE_KEY 'transferOwnership(address)' "$DEPLOYER_ADDRESS"; show ;;
  accept-deployer)
    [ "$(lc "$(pending)")" = "$(lc "$DEPLOYER_ADDRESS")" ] || { echo "deployer is not pendingOwner (run back-to-deployer first)"; exit 1; }
    send DEPLOYER_PRIVATE_KEY 'acceptOwnership()'; show ;;
  *) echo "usage: $0 status|to-operator|accept-operator|back-to-deployer|accept-deployer" >&2; exit 1 ;;
esac
