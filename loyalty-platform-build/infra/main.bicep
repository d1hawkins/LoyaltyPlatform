// Loyalty Platform — root infrastructure deployment (resource group scope)
// Deploys: App Service Plan, APIM (Consumption), Service Bus, SQL, Redis, Storage,
// Key Vault, App Insights + Log Analytics, Container Apps Environment.
targetScope = 'resourceGroup'

@description('Environment name (dev|staging|prod)')
@allowed([ 'dev', 'staging', 'prod' ])
param environmentName string = 'dev'

@description('Primary Azure region')
param location string = resourceGroup().location

@description('Override location for Azure SQL (eastus SQL provisioning is restricted on this subscription; falls back to eastus2). See /decisions/DECISIONS.md.')
param sqlLocation string = location

@description('Short project prefix used in resource names')
param projectPrefix string = 'loyalty'

@description('Publisher email for APIM')
param apimPublisherEmail string

@description('Publisher org name for APIM')
param apimPublisherName string

@description('SQL admin login name')
param sqlAdminLogin string = 'loyaltyadmin'

@secure()
@description('SQL admin password (random, stored in Key Vault after deploy)')
param sqlAdminPassword string

@description('Azure AD object ID of the SQL AAD admin / deployer (signed-in user)')
param aadAdminObjectId string

@description('Azure AD login name for SQL AAD admin')
param aadAdminLogin string

@description('Common resource tags')
param tags object = {
  environment: environmentName
  project: 'loyalty-platform'
  owner: 'snt-david-h'
}

// --- Naming ---------------------------------------------------------------
var uniq = take(uniqueString(resourceGroup().id, projectPrefix, environmentName), 6)
var baseName = '${projectPrefix}-${environmentName}'

var appServicePlanName = '${baseName}-asp'
var apimName = '${baseName}-apim-${uniq}'
var serviceBusName = '${baseName}-sb-${uniq}'
var sqlServerName = '${baseName}-sql-${uniq}w'
var redisName = '${baseName}-redis-${uniq}'
// storage account name: 3-24 lowercase alnum
var storageAccountName = toLower(replace('${projectPrefix}${environmentName}st${uniq}', '-', ''))
var keyVaultName = '${baseName}-kv-${uniq}'
var logAnalyticsName = '${baseName}-law'
var appInsightsName = '${baseName}-appi'
var containerAppsEnvName = '${baseName}-cae'

// --- Observability --------------------------------------------------------
module appInsights 'modules/app-insights.bicep' = {
  name: 'appInsights-deploy'
  params: {
    workspaceName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
    tags: tags
  }
}

// --- Key Vault ------------------------------------------------------------
module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault-deploy'
  params: {
    name: keyVaultName
    location: location
    tags: tags
    deployerPrincipalId: aadAdminObjectId
  }
}

// --- App Service Plan -----------------------------------------------------
module appServicePlan 'modules/app-service.bicep' = {
  name: 'appServicePlan-deploy'
  params: {
    name: appServicePlanName
    location: location
    tags: tags
    skuName: 'P1v3'
    skuTier: 'PremiumV3'
  }
}

// --- APIM (Consumption) ---------------------------------------------------
module apim 'modules/api-management.bicep' = {
  name: 'apim-deploy'
  params: {
    name: apimName
    location: location
    tags: tags
    publisherEmail: apimPublisherEmail
    publisherName: apimPublisherName
  }
}

// --- Service Bus ----------------------------------------------------------
module serviceBus 'modules/service-bus.bicep' = {
  name: 'serviceBus-deploy'
  params: {
    name: serviceBusName
    location: location
    tags: tags
  }
}

// --- SQL ------------------------------------------------------------------
module sql 'modules/sql-server.bicep' = {
  name: 'sql-deploy'
  params: {
    name: sqlServerName
    location: sqlLocation
    tags: tags
    adminLogin: sqlAdminLogin
    adminPassword: sqlAdminPassword
    aadAdminObjectId: aadAdminObjectId
    aadAdminLogin: aadAdminLogin
  }
}

// --- Redis ----------------------------------------------------------------
module redis 'modules/redis.bicep' = {
  name: 'redis-deploy'
  params: {
    name: redisName
    location: location
    tags: tags
  }
}

// --- Storage --------------------------------------------------------------
module storage 'modules/storage.bicep' = {
  name: 'storage-deploy'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
  }
}

// --- Container Apps Environment -------------------------------------------
// Log Analytics shared key is fetched via listKeys on the workspace.
resource logAnalyticsRef 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsName
  dependsOn: [
    appInsights
  ]
}

module containerAppsEnv 'modules/container-apps.bicep' = {
  name: 'containerAppsEnv-deploy'
  params: {
    name: containerAppsEnvName
    location: location
    tags: tags
    logAnalyticsCustomerId: appInsights.outputs.workspaceCustomerId
    logAnalyticsSharedKey: logAnalyticsRef.listKeys().primarySharedKey
  }
}

// --- Key Vault secrets ----------------------------------------------------
resource kvRef 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  dependsOn: [
    keyVault
  ]
}

resource sqlAdminPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'sql-admin-password'
  properties: {
    value: sqlAdminPassword
  }
}

resource sqlAdminLoginSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'sql-admin-login'
  properties: {
    value: sqlAdminLogin
  }
}

resource serviceBusConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'service-bus-connection-string'
  properties: {
    value: serviceBus.outputs.primaryConnectionString
  }
}

resource redisConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'redis-connection-string'
  properties: {
    value: redis.outputs.connectionString
  }
}

resource storageConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'storage-connection-string'
  properties: {
    value: storage.outputs.connectionString
  }
}

resource appInsightsConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kvRef
  name: 'app-insights-connection-string'
  properties: {
    value: appInsights.outputs.connectionString
  }
}

// --- Outputs --------------------------------------------------------------
output subscriptionId string = subscription().subscriptionId
output resourceGroup string = resourceGroup().name
output location string = location

output appServicePlanId string = appServicePlan.outputs.id
output appServicePlanName string = appServicePlan.outputs.name

output apimName string = apim.outputs.name
output apimUrl string = apim.outputs.gatewayUrl

output serviceBusNamespace string = serviceBus.outputs.name
output serviceBusConnectionStringSecretName string = serviceBusConnectionSecret.name

output sqlServerName string = sql.outputs.serverName
output sqlServerFqdn string = sql.outputs.fqdn
output controlPlaneDbName string = sql.outputs.controlPlaneDbName

output redisName string = redis.outputs.name
output redisHostname string = redis.outputs.hostname
output redisConnectionStringSecretName string = redisConnectionSecret.name

output storageAccountName string = storage.outputs.name

output keyVaultName string = keyVault.outputs.name
output keyVaultUri string = keyVault.outputs.uri

output appInsightsName string = appInsights.outputs.appInsightsName
output appInsightsConnectionString string = appInsights.outputs.connectionString
output appInsightsConnectionStringSecretName string = appInsightsConnectionSecret.name

output logAnalyticsWorkspaceId string = appInsights.outputs.workspaceId
output logAnalyticsWorkspaceCustomerId string = appInsights.outputs.workspaceCustomerId

output containerAppsEnvId string = containerAppsEnv.outputs.id
output containerAppsEnvName string = containerAppsEnv.outputs.name
