export type Channel = 'email' | 'sms' | 'push';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'suppressed';

export interface NotificationLogEntry {
  notificationId: string;
  memberId: string;
  channel: Channel;
  templateKey: string;
  subject: string | null;
  bodyPreview: string | null;
  recipientCiphertext: string; // encrypted
  recipientHash: string;
  status: NotificationStatus;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  triggeredByEventId: string | null;
  locale: string;
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationPreference {
  memberId: string;
  templateKey: string;
  channel: Channel;
  optedIn: boolean;
  updatedAt: string;
}

export interface TemplateVariables {
  memberName?: string;
  memberId?: string;
  tenantName?: string;
  previousTier?: string;
  newTier?: string;
  pointsBalance?: number;
  programName?: string;
  unsubscribeUrl?: string;
  supportEmail?: string;
  [key: string]: unknown;
}

export interface SendRequest {
  memberId: string;
  templateKey: string;
  channel: Channel;
  locale?: string;
  variables?: TemplateVariables;
  triggeredByEventId?: string;
}

export interface MemberContact {
  memberId: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  locale?: string;
  status?: string;
}

export interface DeviceRegistration {
  registrationId: string;
  memberId: string;
  deviceToken: string;
  platform: 'ios' | 'android';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
