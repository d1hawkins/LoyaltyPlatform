#!/usr/bin/env bash
# APIM additive config deploy — T-07 / A-07
# Usage: ./deploy.sh [resource-group]
set -euo pipefail

RG="${1:-loyalty-platform-dev}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BICEP="$HERE/apim-config.bicep"

echo "[apim] building bicep..."
az bicep build --file "$BICEP"

echo "[apim] validating deployment against $RG..."
az deployment group validate \
  --resource-group "$RG" \
  --template-file "$BICEP" \
  --output none

echo "[apim] deploying..."
az deployment group create \
  --resource-group "$RG" \
  --template-file "$BICEP" \
  --name "apim-config-$(date +%Y%m%d%H%M%S)" \
  --output table

echo "[apim] done. Listing APIs:"
az apim api list \
  --resource-group "$RG" \
  --service-name loyalty-dev-apim-5rdrqh \
  -o table
