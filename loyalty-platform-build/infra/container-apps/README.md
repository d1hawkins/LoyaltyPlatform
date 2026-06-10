# Container Apps — Phase 1

Author: Agent A-12 (Task T-12)

## Manual one-time setup (human operator)

```bash
SUFFIX=5rdrqh
ACR=loyaltydevacr${SUFFIX}
az acr create -g loyalty-platform-dev -n "$ACR" --sku Basic --admin-enabled true
az acr login -n "$ACR"
```

Record the resulting ACR name as:

- GitHub Actions repository variable `ACR_NAME` (used by `deploy-services.yml`).
- Appended to `/decisions/DECISIONS.md`.

## GitHub OIDC federated identity (one-time)

```bash
APP_ID=$(az ad app create --display-name loyalty-gh-oidc --query appId -o tsv)
az ad sp create --id "$APP_ID"
az role assignment create --assignee "$APP_ID" --role Contributor --scope /subscriptions/13e630db-8816-46b8-896e-511fab75a53a/resourceGroups/loyalty-platform-dev
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name":"gh-main",
  "issuer":"https://token.actions.githubusercontent.com",
  "subject":"repo:<org>/<repo>:ref:refs/heads/main",
  "audiences":["api://AzureADTokenExchange"]
}'
```

Then store `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` as
GitHub Actions secrets.

## Deploy from CI

Push to `main` touching `services/**` triggers `.github/workflows/deploy-services.yml`
which builds each service image and runs `az containerapp create/update`.

## Deploy from Bicep (alternative)

```bash
az deployment group create \
  -g loyalty-platform-dev \
  -f infra/container-apps/main.bicep \
  -p acrLoginServer=${ACR}.azurecr.io \
     acrUsername=${ACR} \
     acrPassword=$(az acr credential show -n ${ACR} --query passwords[0].value -o tsv) \
     imageTag=dev
```

## Current state

`outputs.json` is the source of truth. In this repo it is committed with
`mode: CODE-COMPLETE` because Docker was not available when A-12 ran — no
live images were pushed. The first human-triggered CI run will flip this to
`LIVE` and overwrite the file with real FQDNs.
