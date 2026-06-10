#!/usr/bin/env bash
# One-liner: print the access_token to stdout so it can be piped into curl, e.g.
#   TOKEN=$(./acquire-b2b-token.sh) && curl -H "Authorization: Bearer $TOKEN" ...
set -euo pipefail
: "${B2C_TENANT_NAME:?}" "${B2C_B2B_CLIENT_ID:?}" "${B2C_B2B_CLIENT_SECRET:?}"
SCOPE="${B2C_SCOPE:-api://loyalty-b2b/.default}"
curl -sS -X POST \
  "https://${B2C_TENANT_NAME}.b2clogin.com/${B2C_TENANT_NAME}.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_ClientCredentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${B2C_B2B_CLIENT_ID}" \
  -d "client_secret=${B2C_B2B_CLIENT_SECRET}" \
  -d "scope=${SCOPE}" \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/'
