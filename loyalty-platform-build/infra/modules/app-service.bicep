@description('App Service Plan name')
param name string
param location string
param tags object
@description('SKU name, e.g. P1v3')
param skuName string = 'P1v3'
@description('SKU tier, e.g. PremiumV3')
param skuTier string = 'PremiumV3'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

output id string = plan.id
output name string = plan.name
