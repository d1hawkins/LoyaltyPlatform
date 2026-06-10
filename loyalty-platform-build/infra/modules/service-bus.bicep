@description('Service Bus namespace name')
param name string
param location string
param tags object
param topics array = [
  'member.enrolled'
  'points.earned'
  'points.redeemed'
  'tier.upgraded'
  'tier.downgraded'
  'transaction.voided'
  'member.deleted'
  'member.updated'
  'webhook.delivery'
]

resource sbns 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
  }
}

resource sbTopics 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = [for topic in topics: {
  parent: sbns
  name: topic
  properties: {
    defaultMessageTimeToLive: 'P14D'
    enableBatchedOperations: true
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    supportOrdering: false
  }
}]

resource rootRule 'Microsoft.ServiceBus/namespaces/authorizationRules@2022-10-01-preview' existing = {
  parent: sbns
  name: 'RootManageSharedAccessKey'
}

output id string = sbns.id
output name string = sbns.name
output endpoint string = sbns.properties.serviceBusEndpoint
#disable-next-line use-resource-symbol-reference
output primaryConnectionString string = rootRule.listKeys().primaryConnectionString
