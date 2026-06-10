# SMS Activation Guide

> **Status:** NoopSmsProvider active (logs but doesn't send). End-to-end flow verified.
> **Blocker:** Azure subscription cannot purchase phone numbers — needs support ticket.
> **Estimated time to activate:** 30 minutes (after phone number is available)

---

## What's Already Done

- ✅ Azure Communication Services resource created: `loyalty-dev-acs`
- ✅ ACS connection string stored in Key Vault: `acs-connection-string`
- ✅ `AzureCommSmsProvider` implemented in notification-service
- ✅ Visit milestone → coupon generation → SMS trigger flow wired end-to-end
- ✅ SMS template `visit_milestone_coupon` created (text + HTML)
- ✅ Verified: transaction triggers milestone check, coupon code generated, SMS logged

## What's Needed

### Step 1: Enable Phone Number Purchase (Azure Support)

File a support ticket:
- Portal → **Help + Support** → **New support request**
- Issue type: **Service and subscription limits (quotas)**
- Subscription: `SNT - David H` (`13e630db-8816-46b8-896e-511fab75a53a`)
- Quote type: **Communication Services — Phone Numbers**
- Request: "Enable toll-free phone number purchase for SMS on this subscription"
- Turnaround: 1-3 business days

### Step 2: Purchase a Phone Number

Once approved, run:

```bash
cd /tmp && mkdir -p acs-setup && cd acs-setup
npm init -y && npm install @azure/communication-phone-numbers

ACS_CONN=$(az keyvault secret show --vault-name loyalty-dev-kv-5rdrqh \
  --name acs-connection-string --query value -o tsv)

cat > purchase.js << 'SCRIPT'
const { PhoneNumbersClient } = require('@azure/communication-phone-numbers');
const client = new PhoneNumbersClient(process.argv[2]);

async function main() {
  console.log('Searching for toll-free numbers...');
  const search = await client.beginSearchAvailablePhoneNumbers({
    countryCode: 'US',
    phoneNumberType: 'tollFree',
    assignmentType: 'application',
    capabilities: { sms: 'outbound', calling: 'none' },
    quantity: 1,
  });
  const result = await search.pollUntilDone();
  console.log('Found:', result.phoneNumbers);

  if (result.phoneNumbers?.length > 0) {
    console.log('Purchasing:', result.phoneNumbers[0]);
    const purchase = await client.beginPurchasePhoneNumbers(result.searchId);
    await purchase.pollUntilDone();
    console.log('✅ Purchase complete!');

    for await (const num of client.listPurchasedPhoneNumbers()) {
      console.log('Owned:', num.phoneNumber);
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
SCRIPT

node purchase.js "$ACS_CONN"
```

**Cost:** ~$2/month for toll-free + $0.0075/outbound SMS

### Step 3: Configure Notification Service

```bash
ACS_CONN=$(az keyvault secret show --vault-name loyalty-dev-kv-5rdrqh \
  --name acs-connection-string --query value -o tsv)

az webapp config appsettings set \
  --name loyalty-dev-notification-service \
  -g loyalty-platform-dev \
  --settings \
    SMS_PROVIDER=azure-comm \
    AZURE_COMM_CONNECTION_STRING="$ACS_CONN" \
    SMS_FROM_NUMBER="+1XXXXXXXXXX"
```

Replace `+1XXXXXXXXXX` with the purchased phone number.

### Step 4: Verify

Process a transaction on the POS that pushes a member to a visit milestone. The member should receive a real SMS within seconds:

```
🎉 Congrats! You've earned a [offer name]!
Use code DAISO-XXXX-XXXXXX on your next visit to Daiso.
$5.00 off your purchase!
```

### Step 5: Verify in Admin Portal

Check notification log shows `channel: sms`, `status: sent`, `provider: azure-comm`.

---

## Alternative: Twilio

If Azure phone number purchase remains blocked, Twilio is a drop-in alternative:

```bash
az webapp config appsettings set \
  --name loyalty-dev-notification-service \
  -g loyalty-platform-dev \
  --settings \
    SMS_PROVIDER=twilio \
    TWILIO_ACCOUNT_SID="your-account-sid" \
    TWILIO_AUTH_TOKEN="your-auth-token" \
    SMS_FROM_NUMBER="+1XXXXXXXXXX"
```

Requires: Twilio account + purchased phone number (~$1/month + $0.0079/SMS).

---

## Azure Resources

| Resource | Name | Location |
|----------|------|----------|
| ACS | `loyalty-dev-acs` | global (data: unitedstates) |
| Key Vault Secret | `acs-connection-string` | `loyalty-dev-kv-5rdrqh` |

## Related Code

| Component | File |
|-----------|------|
| SMS Provider (Noop + ACS) | `services/notification-service/src/providers/sms-provider.ts` |
| SMS Template | `services/notification-service/templates/visit_milestone_coupon/` |
| Milestone Detection | `services/loyalty-engine/src/engine.ts` (post-transaction check) |
| Milestone Endpoint | `services/offer-service/src/routes.ts` (`/v1/internal/milestones/check`) |
| Notification Send | `services/notification-service/src/service.ts` |
