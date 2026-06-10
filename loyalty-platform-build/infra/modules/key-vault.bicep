@description('Key Vault name (globally unique, <=24 chars)')
param name string
param location string
param tags object
@description('Principal ID of the deployer to grant Key Vault Administrator')
param deployerPrincipalId string
param tenantId string = subscription().tenantId

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: null
    publicNetworkAccess: 'Enabled'
  }
}

// Key Vault Administrator role on the deployer so we can write secrets via Bicep on re-run if needed.
resource kvAdminRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(kv.id, deployerPrincipalId, 'kvadmin')
  scope: kv
  properties: {
    // Key Vault Administrator
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '00482a5a-887f-4fb3-b363-3b7fe8e74483')
    principalId: deployerPrincipalId
    principalType: 'User'
  }
}

output id string = kv.id
output name string = kv.name
output uri string = kv.properties.vaultUri
