@description('Azure Cache for Redis name')
param name string
param location string
param tags object

resource redis 'Microsoft.Cache/redis@2023-08-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    redisVersion: '6'
  }
}

output id string = redis.id
output name string = redis.name
output hostname string = redis.properties.hostName
output sslPort int = redis.properties.sslPort
#disable-next-line use-resource-symbol-reference
output primaryKey string = redis.listKeys().primaryKey
output connectionString string = '${redis.properties.hostName}:${redis.properties.sslPort},password=${redis.listKeys().primaryKey},ssl=True,abortConnect=False'
