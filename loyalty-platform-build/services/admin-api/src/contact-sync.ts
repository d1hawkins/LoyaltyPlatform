/**
 * Contact Sync Module
 *
 * Syncs loyalty member data to marketing automation platforms.
 * Currently supports ActiveCampaign; designed for extensibility
 * to Klaviyo, Braze, SendGrid, etc.
 */

// ── Types ──

export interface MemberData {
  memberId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  tierName: string;
  pointsBalance: number;
  enrolledAt: string;
  status: string;
}

export interface IntegrationConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  listId: string;
  automationMappings?: Record<string, string | null>;
  syncSchedule?: string;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  contactsSynced?: number;
}

export interface LoyaltyEvent {
  eventType: string;
  memberData: MemberData;
  tenantId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
}

export interface SyncResult {
  synced: number;
  errors: number;
  errorDetails?: string[];
}

// ── ActiveCampaign Sync ──

export class ActiveCampaignSync {
  constructor(
    private apiUrl: string,
    private apiKey: string,
    private listId: string,
  ) {}

  private get headers(): Record<string, string> {
    return {
      'Api-Token': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Test the connection by fetching a single contact.
   * Returns account info on success.
   */
  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      const res = await fetch(`${this.apiUrl}/api/3/contacts?limit=1`, {
        method: 'GET',
        headers: this.headers,
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `HTTP ${res.status}: ${text}` };
      }
      // Try to get account name from a separate call
      let accountName = 'ActiveCampaign';
      try {
        const acctRes = await fetch(`${this.apiUrl}/api/3/accounts?limit=1`, {
          method: 'GET',
          headers: this.headers,
        });
        if (acctRes.ok) {
          const acctData = (await acctRes.json()) as { accounts?: Array<{ name?: string }> };
          if (acctData?.accounts?.[0]?.name) {
            accountName = acctData.accounts[0].name;
          }
        }
      } catch {
        // Account name is optional; ignore errors
      }
      return { success: true, accountName };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Sync a single member to ActiveCampaign.
   * Uses the contact/sync endpoint which creates or updates.
   */
  async syncMember(member: MemberData): Promise<{ contactId?: string }> {
    // Step 1: Create or update the contact
    const contactRes = await fetch(`${this.apiUrl}/api/3/contact/sync`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        contact: {
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          phone: member.phone ?? '',
          fieldValues: [
            { field: 'LOYALTY_TIER', value: member.tierName },
            { field: 'LOYALTY_POINTS', value: String(member.pointsBalance) },
            { field: 'LOYALTY_MEMBER_ID', value: member.memberId },
            { field: 'LOYALTY_ENROLLED_AT', value: member.enrolledAt },
            { field: 'LOYALTY_STATUS', value: member.status },
          ],
        },
      }),
    });

    if (!contactRes.ok) {
      const errText = await contactRes.text();
      throw new Error(`ActiveCampaign contact/sync failed: HTTP ${contactRes.status} — ${errText}`);
    }

    const contactData = (await contactRes.json()) as { contact?: { id?: string } };
    const contactId = contactData?.contact?.id;

    // Step 2: Add contact to the configured list
    if (contactId && this.listId) {
      try {
        await fetch(`${this.apiUrl}/api/3/contactLists`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({
            contactList: {
              list: this.listId,
              contact: contactId,
              status: 1, // 1 = subscribed
            },
          }),
        });
      } catch {
        // List assignment is best-effort; don't fail the sync
      }
    }

    return { contactId };
  }

  /**
   * Trigger an ActiveCampaign automation for a contact.
   */
  async triggerAutomation(contactEmail: string, automationId: string): Promise<void> {
    // First, look up the contact by email to get their ID
    const searchRes = await fetch(
      `${this.apiUrl}/api/3/contacts?email=${encodeURIComponent(contactEmail)}`,
      { method: 'GET', headers: this.headers },
    );

    if (!searchRes.ok) {
      throw new Error(`ActiveCampaign contact lookup failed: HTTP ${searchRes.status}`);
    }

    const searchData = (await searchRes.json()) as { contacts?: Array<{ id?: string }> };
    const contactId = searchData?.contacts?.[0]?.id;
    if (!contactId) {
      throw new Error(`Contact not found in ActiveCampaign: ${contactEmail}`);
    }

    // Add contact to the automation
    const autoRes = await fetch(`${this.apiUrl}/api/3/contactAutomations`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        contactAutomation: {
          contact: contactId,
          automation: automationId,
        },
      }),
    });

    if (!autoRes.ok) {
      const errText = await autoRes.text();
      throw new Error(`ActiveCampaign trigger automation failed: HTTP ${autoRes.status} — ${errText}`);
    }
  }

  /**
   * Full sync: iterate all members and sync each to ActiveCampaign.
   */
  async fullSync(members: MemberData[]): Promise<SyncResult> {
    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const m of members) {
      try {
        await this.syncMember(m);
        synced++;
      } catch (err) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        if (errorDetails.length < 10) {
          errorDetails.push(`${m.memberId}: ${message}`);
        }
      }
    }

    return { synced, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
  }
}

// ── Klaviyo Sync ──

export class KlaviyoSync {
  constructor(private apiKey: string) {}

  // Klaviyo uses revision-based API (v2024-10-15)
  private headers() {
    return {
      'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    };
  }

  async testConnection(): Promise<{ success: boolean; accountName?: string; error?: string }> {
    try {
      // GET /api/accounts/ — returns account info
      const res = await fetch('https://a.klaviyo.com/api/accounts/', { headers: this.headers() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: (err as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        data?: Array<{ attributes?: { contact_information?: { default_sender_name?: string } } }>;
      };
      const name = data.data?.[0]?.attributes?.contact_information?.default_sender_name || 'Klaviyo Account';
      return { success: true, accountName: name };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async syncMember(member: MemberData): Promise<void> {
    // POST /api/profile-import/ — create or update profile
    const payload = {
      data: {
        type: 'profile',
        attributes: {
          email: member.email,
          phone_number: member.phone,
          first_name: member.firstName,
          last_name: member.lastName,
          properties: {
            'Loyalty Tier': member.tierName,
            'Loyalty Points': member.pointsBalance,
            'Loyalty Member ID': member.memberId,
            'Loyalty Enrolled At': member.enrolledAt,
            'Loyalty Status': member.status,
          },
        },
      },
    };

    const res = await fetch('https://a.klaviyo.com/api/profile-import/', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { errors?: Array<{ detail?: string }> }).errors?.[0]?.detail || `Klaviyo sync failed: ${res.status}`);
    }
  }

  async addToList(profileId: string, listId: string): Promise<void> {
    // POST /api/lists/{listId}/relationships/profiles/
    const payload = { data: [{ type: 'profile', id: profileId }] };
    await fetch(`https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async triggerEvent(email: string, eventName: string, properties: Record<string, unknown>): Promise<void> {
    // POST /api/events/ — create an event (replaces automation trigger)
    const payload = {
      data: {
        type: 'event',
        attributes: {
          profile: { data: { type: 'profile', attributes: { email } } },
          metric: { data: { type: 'metric', attributes: { name: eventName } } },
          properties,
          time: new Date().toISOString(),
        },
      },
    };

    await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  /**
   * Full sync: iterate all members and sync each to Klaviyo.
   */
  async fullSync(members: MemberData[]): Promise<SyncResult> {
    let synced = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const m of members) {
      try {
        await this.syncMember(m);
        synced++;
      } catch (err) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        if (errorDetails.length < 10) {
          errorDetails.push(`${m.memberId}: ${message}`);
        }
      }
    }

    return { synced, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
  }
}

// ── Klaviyo Event Name Mapping ──

const KLAVIYO_EVENT_MAP: Record<string, string> = {
  'member.enrolled': 'Loyalty Member Enrolled',
  'tier.upgraded': 'Loyalty Tier Upgraded',
  'tier.downgraded': 'Loyalty Tier Downgraded',
  'points.earned': 'Loyalty Points Earned',
  'points.expiring': 'Loyalty Points Expiring',
};

// ── Webhook-to-Automation Bridge ──

/**
 * Handle a loyalty event by syncing the member and triggering
 * any mapped automation/event in the configured integration.
 *
 * For ActiveCampaign: triggers an automation by ID.
 * For Klaviyo: fires a metric event (using event name from mappings or default).
 */
export async function handleLoyaltyEvent(
  event: LoyaltyEvent,
  integrationConfig: IntegrationConfig | undefined,
  provider?: string,
): Promise<{ triggered: boolean; automationId?: string; error?: string }> {
  if (!integrationConfig?.enabled) {
    return { triggered: false };
  }

  const automationId = integrationConfig.automationMappings?.[event.eventType];
  if (!automationId) {
    return { triggered: false };
  }

  try {
    if (provider === 'klaviyo') {
      const sync = new KlaviyoSync(integrationConfig.apiKey);

      // Ensure the contact is synced with latest data
      await sync.syncMember(event.memberData);

      // Use custom event name from mappings, or fall back to default Klaviyo event name
      const eventName = automationId || KLAVIYO_EVENT_MAP[event.eventType] || event.eventType;
      await sync.triggerEvent(event.memberData.email, eventName, {
        tierName: event.memberData.tierName,
        pointsBalance: event.memberData.pointsBalance,
        ...(event.payload ?? {}),
      });

      return { triggered: true, automationId: eventName };
    }

    // Default: ActiveCampaign
    const sync = new ActiveCampaignSync(
      integrationConfig.apiUrl,
      integrationConfig.apiKey,
      integrationConfig.listId,
    );

    // Ensure the contact is synced with latest data
    await sync.syncMember(event.memberData);
    // Trigger the automation
    await sync.triggerAutomation(event.memberData.email, automationId);
    return { triggered: true, automationId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { triggered: false, automationId, error: message };
  }
}
