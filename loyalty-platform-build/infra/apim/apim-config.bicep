// ============================================================================
// Loyalty Platform — APIM additive configuration (T-07 / A-07)
//
// Additive module — assumes the APIM instance already exists (provisioned by
// /infra/main.bicep as `loyalty-dev-apim-5rdrqh`, Consumption tier).
//
// Creates:
//   - Named values: B2C_JWKS_URI, B2C_ISSUER, MEMBER_SERVICE_BACKEND_URL,
//                   LOYALTY_ENGINE_BACKEND_URL
//   - Service-scope global policy (JWT validation + CORS + correlation-id +
//     X-Tenant-ID / X-User-ID injection + dev X-Skip-Auth bypass)
//   - APIs: member-api, loyalty-engine-api (OpenAPI imported from yaml)
//   - API-scope inbound policies for each API
//   - Product: loyalty-b2b (rate-limit 1000/min at product scope) linking both APIs
//
// Constraints (Consumption tier):
//   - No response caching
//   - No rate-limit-by-key (using plain rate-limit)
//   - Named values from Key Vault are supported on Consumption but we use
//     literal placeholders here so this deploy does not require KV secret
//     existence. Operator swaps placeholders after B2C unblocks (see HANDOFF).
// ============================================================================

targetScope = 'resourceGroup'

@description('Name of the pre-existing APIM instance')
param apimName string = 'loyalty-dev-apim-5rdrqh'

@description('Placeholder OIDC discovery URL — must be reachable at policy-apply time. APIM fetches this synchronously whenever the policy is saved. Swap to the real B2C value after A-06 unblocks: `https://<tenant>.b2clogin.com/<tenant>.onmicrosoft.com/B2C_1A_ClientCredentials/v2.0/.well-known/openid-configuration`. Default points at the Microsoft common v2.0 endpoint so deploys succeed before B2C exists — it is GATED OFF by B2C_VALIDATE_JWT_ENABLED=false so no tokens are ever actually verified against it.')
param b2cJwksUri string = 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'

@description('Placeholder B2C issuer claim — replace after B2C tenant exists')
param b2cIssuer string = 'https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0'

@description('Member-service backend base URL (Container Apps FQDN placeholder until A-12 deploy)')
param memberServiceBackendUrl string = 'https://member-service.internal.loyalty-dev-cae.eastus.azurecontainerapps.io'

@description('Loyalty-engine backend base URL (Container Apps FQDN placeholder until A-12 deploy)')
param loyaltyEngineBackendUrl string = 'https://loyalty-engine.internal.loyalty-dev-cae.eastus.azurecontainerapps.io'

// ---------- Reference the existing APIM instance ---------------------------
resource apim 'Microsoft.ApiManagement/service@2023-03-01-preview' existing = {
  name: apimName
}

// ---------- Named values ----------------------------------------------------
resource nvB2cJwksUri 'Microsoft.ApiManagement/service/namedValues@2023-03-01-preview' = {
  parent: apim
  name: 'B2C-JWKS-URI'
  properties: {
    displayName: 'B2C_JWKS_URI'
    value: b2cJwksUri
    secret: false
  }
}

resource nvB2cIssuer 'Microsoft.ApiManagement/service/namedValues@2023-03-01-preview' = {
  parent: apim
  name: 'B2C-ISSUER'
  properties: {
    displayName: 'B2C_ISSUER'
    value: b2cIssuer
    secret: false
  }
}

resource nvB2cValidateEnabled 'Microsoft.ApiManagement/service/namedValues@2023-03-01-preview' = {
  parent: apim
  name: 'B2C-VALIDATE-JWT-ENABLED'
  properties: {
    displayName: 'B2C_VALIDATE_JWT_ENABLED'
    value: 'false'
    secret: false
  }
}

resource nvMemberBackend 'Microsoft.ApiManagement/service/namedValues@2023-03-01-preview' = {
  parent: apim
  name: 'MEMBER-SERVICE-BACKEND-URL'
  properties: {
    displayName: 'MEMBER_SERVICE_BACKEND_URL'
    value: memberServiceBackendUrl
    secret: false
  }
}

resource nvEngineBackend 'Microsoft.ApiManagement/service/namedValues@2023-03-01-preview' = {
  parent: apim
  name: 'LOYALTY-ENGINE-BACKEND-URL'
  properties: {
    displayName: 'LOYALTY_ENGINE_BACKEND_URL'
    value: loyaltyEngineBackendUrl
    secret: false
  }
}

// ---------- Service-scope global policy -------------------------------------
resource globalPolicy 'Microsoft.ApiManagement/service/policies@2023-03-01-preview' = {
  parent: apim
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('./policies/global.xml')
  }
  dependsOn: [
    nvB2cJwksUri
    nvB2cIssuer
    nvB2cValidateEnabled
  ]
}

// ---------- Member service API ----------------------------------------------
resource memberApi 'Microsoft.ApiManagement/service/apis@2023-03-01-preview' = {
  parent: apim
  name: 'member-api'
  properties: {
    displayName: 'Loyalty — Member Service'
    description: 'Member enrollment, profile, lookup, GDPR, ledger'
    subscriptionRequired: true
    path: 'member'
    protocols: [ 'https' ]
    format: 'openapi'
    value: loadTextContent('./openapi/member-service.yaml')
  }
}

resource memberApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-03-01-preview' = {
  parent: memberApi
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('./policies/member-service-inbound.xml')
  }
  dependsOn: [
    nvMemberBackend
  ]
}

// ---------- Loyalty engine API ----------------------------------------------
resource engineApi 'Microsoft.ApiManagement/service/apis@2023-03-01-preview' = {
  parent: apim
  name: 'loyalty-engine-api'
  properties: {
    displayName: 'Loyalty — Engine'
    description: 'Transactions, voids, redemptions, balance, admin adjustments'
    subscriptionRequired: true
    path: 'engine'
    protocols: [ 'https' ]
    format: 'openapi'
    value: loadTextContent('./openapi/loyalty-engine.yaml')
  }
}

resource engineApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-03-01-preview' = {
  parent: engineApi
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('./policies/loyalty-engine-inbound.xml')
  }
  dependsOn: [
    nvEngineBackend
  ]
}

// ---------- Product: loyalty-b2b --------------------------------------------
resource productB2b 'Microsoft.ApiManagement/service/products@2023-03-01-preview' = {
  parent: apim
  name: 'loyalty-b2b'
  properties: {
    displayName: 'Loyalty B2B'
    description: 'B2B tenant access to the Loyalty Platform APIs (1000 req/min rate limit).'
    subscriptionRequired: true
    approvalRequired: false
    state: 'published'
  }
}

resource productPolicy 'Microsoft.ApiManagement/service/products/policies@2023-03-01-preview' = {
  parent: productB2b
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: loadTextContent('./policies/rate-limit-1000-per-min.xml')
  }
}

resource productMemberLink 'Microsoft.ApiManagement/service/products/apis@2023-03-01-preview' = {
  parent: productB2b
  name: 'member-api'
  dependsOn: [
    memberApi
  ]
}

resource productEngineLink 'Microsoft.ApiManagement/service/products/apis@2023-03-01-preview' = {
  parent: productB2b
  name: 'loyalty-engine-api'
  dependsOn: [
    engineApi
  ]
}

// ---------- Outputs ---------------------------------------------------------
output apimGatewayUrl string = 'https://${apimName}.azure-api.net'
output memberApiPath string = 'member'
output engineApiPath string = 'engine'
output productName string = 'loyalty-b2b'
