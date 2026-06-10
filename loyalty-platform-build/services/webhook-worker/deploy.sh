#!/usr/bin/env bash
# Placeholder deploy script for webhook-worker.
# Real image build + push + container app creation is owned by A-12 (CI/CD).
# This script exists so A-12 has a single well-known entry point to call.
set -euo pipefail

RG="${RG:-loyalty-dev-rg}"
ENV="${ENV:-loyalty-dev-cae}"
APP_NAME="${APP_NAME:-webhook-worker}"
IMAGE="${IMAGE:-ghcr.io/hawkone/loyalty/webhook-worker:dev}"

echo "[webhook-worker] deploy stub"
echo "  resource group: ${RG}"
echo "  container env : ${ENV}"
echo "  app name      : ${APP_NAME}"
echo "  image         : ${IMAGE}"

# Intentionally NOT executed by A-09. A-12 will uncomment / invoke.
# az containerapp create \
#   --name "${APP_NAME}" \
#   --resource-group "${RG}" \
#   --environment "${ENV}" \
#   --image "${IMAGE}" \
#   --ingress external --target-port 3009 \
#   --min-replicas 1 --max-replicas 3 \
#   --env-vars \
#     NODE_ENV=production \
#     PORT=3009 \
#     DELIVERY_POLL_MS=2000 \
#     DELIVERY_BATCH_SIZE=50 \
#     HTTP_TIMEOUT_MS=10000 \
#     SERVICE_BUS_CONNECTION_STRING=secretref:service-bus-connstr \
#     CONTROL_PLANE_SQL_CONNSTR=secretref:control-plane-sql \
#     KEY_VAULT_URI=secretref:key-vault-uri
