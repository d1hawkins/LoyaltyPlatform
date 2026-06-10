// Phase 1 Container Apps — author: A-12
// Deploys all 8 Phase 1 services into the existing managed environment.
// Scaffold-only services (offer-service, analytics-service) are still defined
// so that operators can switch them on once real images land in Wave 5.

@description('Existing Container Apps managed environment name')
param containerAppsEnvName string = 'loyalty-dev-cae'

@description('ACR login server (e.g. loyaltydevacr5rdrqh.azurecr.io)')
param acrLoginServer string

@description('ACR admin username (same as ACR name for --admin-enabled Basic SKU)')
param acrUsername string

@secure()
@description('ACR admin password')
param acrPassword string

@description('Image tag (git sha) shared by all services')
param imageTag string = 'dev'

@description('Key Vault URI used for secretrefs')
param keyVaultUri string = 'https://loyalty-dev-kv-5rdrqh.vault.azure.net/'

@description('Key Vault name (for role assignment scope lookups done outside this module)')
param keyVaultName string = 'loyalty-dev-kv-5rdrqh'

var commonEnv = [
  { name: 'NODE_ENV',     value: 'dev' }
  { name: 'LOG_LEVEL',    value: 'info' }
  { name: 'SKIP_AUTH',    value: 'true' }
  { name: 'KEY_VAULT_URI', value: keyVaultUri }
  { name: 'CONTROL_PLANE_SQL_CONNSTR', secretRef: 'control-plane-sql' }
  { name: 'SERVICE_BUS_CONNECTION_STRING', secretRef: 'servicebus-conn' }
  { name: 'REDIS_URL', secretRef: 'redis-conn' }
]

var commonSecrets = [
  { name: 'control-plane-sql', keyVaultUrl: '${keyVaultUri}secrets/control-plane-sql-connstr', identity: 'system' }
  { name: 'servicebus-conn',   keyVaultUrl: '${keyVaultUri}secrets/service-bus-connection-string', identity: 'system' }
  { name: 'redis-conn',        keyVaultUrl: '${keyVaultUri}secrets/redis-connection-string', identity: 'system' }
  { name: 'acr-password',      value: acrPassword }
]

var registries = [
  { server: acrLoginServer, username: acrUsername, passwordSecretRef: 'acr-password' }
]

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvName
}

var services = [
  { name: 'member-service',       port: 3001, external: true,  scaffold: false }
  { name: 'loyalty-engine',       port: 3000, external: true,  scaffold: false }
  { name: 'admin-api',            port: 3005, external: true,  scaffold: false }
  { name: 'notification-service', port: 3002, external: true,  scaffold: false }
  { name: 'webhook-worker',       port: 3009, external: false, scaffold: false }
  { name: 'tier-eval-worker',     port: 0,    external: false, scaffold: false }
  { name: 'offer-service',        port: 3000, external: true,  scaffold: true  }
  { name: 'analytics-service',    port: 3000, external: true,  scaffold: true  }
]

resource apps 'Microsoft.App/containerApps@2024-03-01' = [for svc in services: if (!svc.scaffold) {
  name: svc.name
  location: resourceGroup().location
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: cae.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registries
      secrets: commonSecrets
      ingress: svc.port == 0 ? null : {
        external: svc.external
        targetPort: svc.port
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: svc.name
          image: '${acrLoginServer}/${svc.name}:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1.0Gi' }
          env: commonEnv
          probes: svc.port == 0 ? [] : [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: svc.port }
              initialDelaySeconds: 10
              periodSeconds: 20
            }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}]

output serviceFqdns array = [for (svc, i) in services: {
  name: svc.name
  scaffold: svc.scaffold
  fqdn: (svc.scaffold || svc.port == 0) ? '' : apps[i].properties.configuration.ingress.fqdn
}]
