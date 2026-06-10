#!/usr/bin/env bash
# Renders B2C custom policy XML files by substituting placeholders with real
# values. Outputs to ./rendered/*.xml — upload those to the B2C tenant.
#
# Required env vars:
#   B2C_TENANT_NAME            e.g. loyaltyplatformdev
#   IEF_APP_ID                 Identity Experience Framework app id
#   IEF_PROXY_APP_ID           Proxy Identity Experience Framework app id
set -euo pipefail

: "${B2C_TENANT_NAME:?set B2C_TENANT_NAME}"
: "${IEF_APP_ID:?set IEF_APP_ID}"
: "${IEF_PROXY_APP_ID:?set IEF_PROXY_APP_ID}"

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${HERE}/rendered"
mkdir -p "${OUT}"

for f in "${HERE}"/*.xml; do
  name="$(basename "$f")"
  sed \
    -e "s|{B2C_TENANT_NAME}|${B2C_TENANT_NAME}|g" \
    -e "s|{IDENTITY_EXPERIENCE_FRAMEWORK_APP_ID}|${IEF_APP_ID}|g" \
    -e "s|{PROXY_IDENTITY_EXPERIENCE_FRAMEWORK_APP_ID}|${IEF_PROXY_APP_ID}|g" \
    "$f" > "${OUT}/${name}"
  echo "rendered: ${OUT}/${name}"
done
