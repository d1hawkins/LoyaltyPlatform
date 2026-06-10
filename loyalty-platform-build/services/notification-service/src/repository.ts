import type { DeviceRegistration, NotificationLogEntry, NotificationPreference, NotificationStatus } from './types';

export interface LogQuery {
  memberId?: string;
  status?: NotificationStatus;
  limit?: number;
  offset?: number;
}

export interface NotificationRepository {
  insertLog(entry: NotificationLogEntry): Promise<void>;
  updateLogStatus(
    notificationId: string,
    patch: Partial<
      Pick<NotificationLogEntry, 'status' | 'provider' | 'providerMessageId' | 'error' | 'sentAt'>
    >,
  ): Promise<void>;
  listLog(query: LogQuery): Promise<NotificationLogEntry[]>;

  getPreference(
    memberId: string,
    templateKey: string,
    channel: string,
  ): Promise<NotificationPreference | null>;
  upsertPreference(pref: NotificationPreference): Promise<void>;

  // Device registration methods for push notifications
  getActiveDeviceRegistrations(memberId: string): Promise<DeviceRegistration[]>;
  upsertDeviceRegistration(reg: Omit<DeviceRegistration, 'registrationId' | 'createdAt' | 'updatedAt'>): Promise<DeviceRegistration>;
  deactivateDeviceRegistration(registrationId: string): Promise<void>;
}
