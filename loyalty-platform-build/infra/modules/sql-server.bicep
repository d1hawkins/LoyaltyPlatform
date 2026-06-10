@description('SQL logical server name')
param name string
param location string
param tags object
@description('SQL admin login name')
param adminLogin string
@secure()
@description('SQL admin password')
param adminPassword string
@description('Azure AD admin object ID (signed-in user)')
param aadAdminObjectId string
@description('Azure AD admin display name/login')
param aadAdminLogin string
param tenantId string = subscription().tenantId
param controlPlaneDbName string = 'control-plane'

resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: name
  location: location
  tags: tags
  properties: {
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: false
      login: aadAdminLogin
      principalType: 'User'
      sid: aadAdminObjectId
      tenantId: tenantId
    }
  }
}

resource allowAzure 'Microsoft.Sql/servers/firewallRules@2023-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource controlPlaneDb 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: controlPlaneDbName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648
    zoneRedundant: false
  }
}

output serverId string = sqlServer.id
output serverName string = sqlServer.name
output fqdn string = sqlServer.properties.fullyQualifiedDomainName
output controlPlaneDbName string = controlPlaneDb.name
