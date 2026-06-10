import { randomUUID } from 'crypto';
import type {
  NotificationRepository,
  LogQuery,
} from './repository';
import type { DeviceRegistration, NotificationLogEntry, NotificationPreference } from './types';

export class InMemoryNotificationRepository implements NotificationRepository {
  public readonly log: NotificationLogEntry[] = [];
  public readonly prefs = new Map<string, NotificationPreference>();
  public readonly deviceRegistrations: DeviceRegistration[] = [];

  private prefKey(memberId: string, templateKey: string, channel: string): string {
    return `${memberId}|${templateKey}|${channel}`;
  }

  public async insertLog(entry: NotificationLogEntry): Promise<void> {
    this.log.push({ ...entry });
  }

  public async updateLogStatus(
    notificationId: string,
    patch: Partial<NotificationLogEntry>,
  ): Promise<void> {
    const idx = this.log.findIndex((e) => e.notificationId === notificationId);
    if (idx < 0) return;
    this.log[idx] = { ...this.log[idx]!, ...patch } as NotificationLogEntry;
  }

  public async listLog(query: LogQuery): Promise<NotificationLogEntry[]> {
    let rows = this.log.slice();
    if (query.memberId) rows = rows.filter((r) => r.memberId === query.memberId);
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return rows.slice(offset, offset + limit);
  }

  public async getPreference(
    memberId: string,
    templateKey: string,
    channel: string,
  ): Promise<NotificationPreference | null> {
    return this.prefs.get(this.prefKey(memberId, templateKey, channel)) ?? null;
  }

  public async upsertPreference(pref: NotificationPreference): Promise<void> {
    this.prefs.set(this.prefKey(pref.memberId, pref.templateKey, pref.channel), { ...pref });
  }

  public async getActiveDeviceRegistrations(memberId: string): Promise<DeviceRegistration[]> {
    return this.deviceRegistrations.filter((r) => r.memberId === memberId && r.isActive);
  }

  public async upsertDeviceRegistration(
    reg: Omit<DeviceRegistration, 'registrationId' | 'createdAt' | 'updatedAt'>,
  ): Promise<DeviceRegistration> {
    const existing = this.deviceRegistrations.find(
      (r) => r.memberId === reg.memberId && r.deviceToken === reg.deviceToken,
    );
    if (existing) {
      existing.platform = reg.platform;
      existing.isActive = reg.isActive;
      existing.updatedAt = new Date().toISOString();
      return { ...existing };
    }
    const now = new Date().toISOString();
    const newReg: DeviceRegistration = {
      registrationId: randomUUID(),
      memberId: reg.memberId,
      deviceToken: reg.deviceToken,
      platform: reg.platform,
      isActive: reg.isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.deviceRegistrations.push(newReg);
    return { ...newReg };
  }

  public async deactivateDeviceRegistration(registrationId: string): Promise<void> {
    const reg = this.deviceRegistrations.find((r) => r.registrationId === registrationId);
    if (reg) {
      reg.isActive = false;
      reg.updatedAt = new Date().toISOString();
    }
  }
}
