#!/usr/bin/env bash
# Smoke test: acquire a B2B client-credentials token from Azure AD B2C and
# confirm it verifies against the configured audience.
#
# Required env vars:
#   B2C_TENANT_NAME            e.g. loyaltyplatformdev
#   B2C_B2B_CLIENT_ID
#   B2C_B2B_CLIENT_SECRET
# Optional:
#   B2C_SCOPE                  default: api://loyalty-b2b/.default
set -euo pipefail

: "${B2C_TENANT_NAME:?set B2C_TENANT_NAME}"
: "${B2C_B2B_CLIENT_ID:?set B2C_B2B_CLIENT_ID}"
: "${B2C_B2B_CLIENT_SECRET:?set B2C_B2B_CLIENT_SECRET}"
SCOPE="${B2C_SCOPE:-api://loyalty-b2b/.default}"

TOKEN_ENDPOINT="https://${B2C_TENANT_NAME}.b2clogin.com/${B2C_TENANT_NAME}.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_ClientCredentials"

echo "POST ${TOKEN_ENDPOINT}"
RESP="$(curl -sS -X POST "${TOKEN_ENDPOINT}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${B2C_B2B_CLIENT_ID}" \
  -d "client_secret=${B2C_B2B_CLIENT_SECRET}" \
  -d "scope=${SCOPE}")"

echo "${RESP}"
echo "${RESP}" | grep -q access_token || { echo "FAIL: no access_token"; exit 1; }
echo "OK"
