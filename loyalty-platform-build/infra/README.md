# Loyalty Platform — Infrastructure (T-01)

Azure Bicep IaC for the Loyalty Platform. Deploys one resource group per environment
(`loyalty-platform-{env}`) containing the full shared-services stack.

## Deployment scope

`main.bicep` is deployed at **resource group scope**. The resource group is created
manually (see below) because we want tenant-controlled tagging at the RG level and
because the subscription the team is using does not grant a subscription-scope deployer
role. All modules under `modules/` are consumed by `main.bicep`.

## Resources provisioned

| Resource | Name (dev) | SKU | Notes |
|---|---|---|---|
| Resource Group | `loyalty-platform-dev` | — | eastus |
| App Service Plan | `loyalty-dev-asp` | P1v3 Linux | Downgraded from P2v3 for dev (see DECISIONS.md) |
| API Management | `loyalty-dev-apim-5rdrqh` | Consumption | Downgraded from Developer for dev (see DECISIONS.md) |
| Service Bus | `loyalty-dev-sb-5rdrqh` | Standard | 9 topics |
| Azure SQL Server | `loyalty-dev-sql-5rdrqhw` | — | Deployed in **westus2** (eastus/eastus2 quota restricted) |
| SQL Database | `control-plane` | Basic (5 DTU) | Empty, owned by control plane |
| Redis | `loyalty-dev-redis-5rdrqh` | Basic C0 | Downgraded from C2 Standard for dev |
| Storage | `loyaltydevst5rdrqh` | Standard_LRS | Blobs, private access only |
| Key Vault | `loyalty-dev-kv-5rdrqh` | Standard, RBAC, soft-delete | Holds all secrets below |
| Log Analytics | `loyalty-dev-law` | PerGB2018 | Feeds Container Apps + App Insights |
| App Insights | `loyalty-dev-appi` | Workspace-based | |
| Container Apps Env | `loyalty-dev-cae` | Consumption | System-assigned MI |

## Service Bus topics

`member.enrolled`, `points.earned`, `points.redeemed`, `tier.upgraded`, `tier.downgraded`,
`transaction.voided`, `member.deleted`, `member.updated`, `webhook.delivery`.

## Key Vault secret names

- `sql-admin-login`
- `sql-admin-password`
- `service-bus-connection-string`
- `redis-connection-string`
- `storage-connection-string`
- `app-insights-connection-string`

Consumers should reference via `@Microsoft.KeyVault(SecretUri=...)` references.

## Prerequisites

- Azure CLI >= 2.60 with Bicep CLI (`az bicep install`)
- Azure subscription `13e630db-8816-46b8-896e-511fab75a53a` (SNT - David H)
- Signed in as a user that is subscription Owner / User Access Admin (needed to grant
  the Key Vault Administrator role used during deploy).

## Deploy commands

```bash
# 1. Set subscription
az account set --subscription 13e630db-8816-46b8-896e-511fab75a53a

# 2. Create resource group (idempotent)
az group create -n loyalty-platform-dev -l eastus \
  --tags environment=dev project=loyalty-platform owner=snt-david-h

# 3. Generate a random SQL admin password (one-off)
SQLPW=$(python3 -c "import secrets,string,random; r=random.SystemRandom(); a=string.ascii_letters+string.digits+'!@#\$%^&*_-'; print(''.join(r.choice(a) for _ in range(24)))")

# 4. Capture the deployer object ID and UPN
AADID=$(az ad signed-in-user show --query id -o tsv)
AADUPN=$(az ad signed-in-user show --query userPrincipalName -o tsv)

# 5. Deploy
az deployment group create \
  -g loyalty-platform-dev \
  -n loyalty-infra-main \
  -f infra/main.bicep \
  -p infra/parameters/dev.parameters.json \
  -p sqlAdminPassword="$SQLPW" \
  -p aadAdminObjectId="$AADID" \
  -p aadAdminLogin="$AADUPN" \
  -p apimPublisherEmail="$AADUPN"
```

The deployment is idempotent; re-running it will produce `ProvisioningState=Succeeded`
with no destructive changes.

## Teardown

```bash
az group delete -n loyalty-platform-dev --yes --no-wait
```

Key Vault is soft-delete-enabled (7 days). To fully purge:
```bash
az keyvault purge -n loyalty-dev-kv-5rdrqh
```

## GitHub Actions

`/.github/workflows/deploy-infra.yml` runs on push to `main` touching `infra/**`. It
uses `azure/login@v2` with OIDC federation. Required repo secrets:

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | App registration (federated credential) client ID |
| `AZURE_TENANT_ID` | `36f9fae3-eeef-4a07-a4e1-0d8c62724e70` |
| `AZURE_SUBSCRIPTION_ID` | `13e630db-8816-46b8-896e-511fab75a53a` |
| `SQL_ADMIN_PASSWORD` | Random strong password — stored in KV at deploy time |
| `AAD_ADMIN_OBJECT_ID` | Object ID of AAD user/group to set as SQL AAD admin |
| `AAD_ADMIN_LOGIN` | UPN of that user/group |
| `APIM_PUBLISHER_EMAIL` | Email used as APIM publisher contact |

## Outputs

See `infra-outputs.json` — consumed by downstream agents (A-02 onward).

## B2C

B2C tenant cannot be created via Bicep/ARM. See `b2c/README.md` for the manual steps.
Logged as a SOFT blocker in `/blockers/BLOCKERS.md` for A-06.
