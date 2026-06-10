import { createLogger } from '@loyalty/shared-logger';
import { InMemoryNotificationRepository } from '../src/repository.memory';
import { TemplateLoader } from '../src/templates';
import { NoopEmailProvider } from '../src/providers';
import { NoopPushProvider } from '../src/providers/push-provider';
import { NoopSmsProvider } from '../src/providers/sms-provider';
import { InMemoryMemberClient } from '../src/member-client';
import { NotificationService } from '../src/service';
import type { MemberContact } from '../src/types';

const TENANT = '00000000-0000-4000-8000-000000000001';
const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const PII_KEY = '11'.repeat(32);
const PEPPER = 'test-pepper';

function buildHarness(members: MemberContact[]) {
  const logger = createLogger('notification-service-test');
  const repo = new InMemoryNotificationRepository();
  const templates = new TemplateLoader();
  const emailProvider = new NoopEmailProvider(logger);
  const pushProvider = new NoopPushProvider(logger);
  const smsProvider = new NoopSmsProvider(logger);
  const memberClient = new InMemoryMemberClient(members);
  const service = new NotificationService(
    repo,
    templates,
    emailProvider,
    memberClient,
    {
      piiKeyHex: PII_KEY,
      recipientPepper: PEPPER,
      fromEmail: 'no-reply@test.local',
      supportEmail: 'support@test.local',
      programName: 'TestPoints',
      tenantName: 'TestCo',
      unsubscribeBaseUrl: 'https://test.local/u',
    },
    logger,
    pushProvider,
    smsProvider,
  );
  return { service, repo, emailProvider, pushProvider, smsProvider, memberClient, logger };
}

const memberWithAll: MemberContact = {
  memberId: MEMBER_A,
  email: 'alice@example.com',
  phone: '+15551234567',
  firstName: 'Alice',
  lastName: 'Smith',
};

describe('multi-channel dispatch', () => {
  describe('email channel', () => {
    it('dispatches via email provider', async () => {
      const { service, emailProvider } = buildHarness([memberWithAll]);
      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'welcome',
        channel: 'email',
      });
      expect(result.status).toBe('sent');
      expect(emailProvider.sent).toHaveLength(1);
      expect(emailProvider.sent[0]!.to).toBe('alice@example.com');
    });
  });

  describe('sms channel', () => {
    it('dispatches via SMS provider', async () => {
      const { service, smsProvider, repo } = buildHarness([memberWithAll]);
      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'welcome',
        channel: 'sms',
      });
      expect(result.status).toBe('sent');
      expect(smsProvider.sent).toHaveLength(1);
      expect(smsProvider.sent[0]!.to).toBe('+15551234567');
      expect(smsProvider.sent[0]!.body).toBeTruthy();

      // Verify log entry
      const log = repo.log.find((r) => r.notificationId === result.notificationId)!;
      expect(log.channel).toBe('sms');
      expect(log.status).toBe('sent');
      expect(log.provider).toBe('noop-sms');
    });

    it('fails when member has no phone', async () => {
      const memberNoPhone: MemberContact = {
        memberId: MEMBER_A,
        email: 'alice@example.com',
        firstName: 'Alice',
      };
      const { service } = buildHarness([memberNoPhone]);
      await expect(
        service.send(TENANT, {
          memberId: MEMBER_A,
          templateKey: 'welcome',
          channel: 'sms',
        }),
      ).rejects.toThrow(/no phone/);
    });

    it('fails when SMS provider not configured', async () => {
      const logger = createLogger('test');
      const repo = new InMemoryNotificationRepository();
      const templates = new TemplateLoader();
      const emailProvider = new NoopEmailProvider(logger);
      const memberClient = new InMemoryMemberClient([memberWithAll]);
      // No push/sms providers
      const service = new NotificationService(
        repo, templates, emailProvider, memberClient,
        {
          piiKeyHex: PII_KEY, recipientPepper: PEPPER,
          fromEmail: 'x@y.z', supportEmail: 'x@y.z',
          programName: 'P', tenantName: 'T',
          unsubscribeBaseUrl: 'https://x',
        },
        logger,
      );
      await expect(
        service.send(TENANT, {
          memberId: MEMBER_A,
          templateKey: 'welcome',
          channel: 'sms',
        }),
      ).rejects.toThrow(/SMS provider not configured/);
    });
  });

  describe('push channel', () => {
    it('dispatches via push provider to registered devices', async () => {
      const { service, pushProvider, repo } = buildHarness([memberWithAll]);
      // Register a device
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'apns-token-abc123',
        platform: 'ios',
        isActive: true,
      });

      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'welcome',
        channel: 'push',
      });
      expect(result.status).toBe('sent');
      expect(pushProvider.sent).toHaveLength(1);
      expect(pushProvider.sent[0]!.deviceToken).toBe('apns-token-abc123');
      expect(pushProvider.sent[0]!.platform).toBe('ios');
      expect(pushProvider.sent[0]!.title).toBeTruthy();

      // Verify log entry
      const log = repo.log.find((r) => r.notificationId === result.notificationId)!;
      expect(log.channel).toBe('push');
      expect(log.status).toBe('sent');
      expect(log.provider).toBe('noop-push');
    });

    it('sends to multiple active devices', async () => {
      const { service, pushProvider, repo } = buildHarness([memberWithAll]);
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'apns-token-1',
        platform: 'ios',
        isActive: true,
      });
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'fcm-token-2',
        platform: 'android',
        isActive: true,
      });

      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'welcome',
        channel: 'push',
      });
      expect(result.status).toBe('sent');
      expect(pushProvider.sent).toHaveLength(2);
    });

    it('skips inactive devices', async () => {
      const { service, repo } = buildHarness([memberWithAll]);
      const reg = await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'old-token',
        platform: 'ios',
        isActive: true,
      });
      await repo.deactivateDeviceRegistration(reg.registrationId);

      await expect(
        service.send(TENANT, {
          memberId: MEMBER_A,
          templateKey: 'welcome',
          channel: 'push',
        }),
      ).rejects.toThrow(/no registered devices/);
    });

    it('fails when member has no registered devices', async () => {
      const { service } = buildHarness([memberWithAll]);
      await expect(
        service.send(TENANT, {
          memberId: MEMBER_A,
          templateKey: 'welcome',
          channel: 'push',
        }),
      ).rejects.toThrow(/no registered devices/);
    });

    it('fails when push provider not configured', async () => {
      const logger = createLogger('test');
      const repo = new InMemoryNotificationRepository();
      const templates = new TemplateLoader();
      const emailProvider = new NoopEmailProvider(logger);
      const memberClient = new InMemoryMemberClient([memberWithAll]);
      const service = new NotificationService(
        repo, templates, emailProvider, memberClient,
        {
          piiKeyHex: PII_KEY, recipientPepper: PEPPER,
          fromEmail: 'x@y.z', supportEmail: 'x@y.z',
          programName: 'P', tenantName: 'T',
          unsubscribeBaseUrl: 'https://x',
        },
        logger,
      );
      await expect(
        service.send(TENANT, {
          memberId: MEMBER_A,
          templateKey: 'welcome',
          channel: 'push',
        }),
      ).rejects.toThrow(/Push provider not configured/);
    });
  });

  describe('preference suppression across channels', () => {
    it('suppresses SMS when opted out', async () => {
      const { service, smsProvider, repo } = buildHarness([memberWithAll]);
      // Opt out of points_earned_digest on SMS
      await service.updatePreference(MEMBER_A, 'points_earned_digest', 'sms', false);

      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'points_earned_digest',
        channel: 'sms',
      });
      expect(result.status).toBe('suppressed');
      expect(smsProvider.sent).toHaveLength(0);
    });

    it('suppresses push when opted out', async () => {
      const { service, pushProvider, repo } = buildHarness([memberWithAll]);
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'token-1',
        platform: 'ios',
        isActive: true,
      });
      await service.updatePreference(MEMBER_A, 'points_earned_digest', 'push', false);

      const result = await service.send(TENANT, {
        memberId: MEMBER_A,
        templateKey: 'points_earned_digest',
        channel: 'push',
      });
      expect(result.status).toBe('suppressed');
      expect(pushProvider.sent).toHaveLength(0);
    });
  });

  describe('device registration', () => {
    it('registers and retrieves active devices', async () => {
      const { repo } = buildHarness([memberWithAll]);
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'token-1',
        platform: 'ios',
        isActive: true,
      });

      const devices = await repo.getActiveDeviceRegistrations(MEMBER_A);
      expect(devices).toHaveLength(1);
      expect(devices[0]!.deviceToken).toBe('token-1');
      expect(devices[0]!.registrationId).toBeTruthy();
    });

    it('upserts existing device by token', async () => {
      const { repo } = buildHarness([memberWithAll]);
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'same-token',
        platform: 'ios',
        isActive: true,
      });
      await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'same-token',
        platform: 'android', // platform changed
        isActive: true,
      });

      const devices = await repo.getActiveDeviceRegistrations(MEMBER_A);
      expect(devices).toHaveLength(1);
      expect(devices[0]!.platform).toBe('android');
    });

    it('deactivateDeviceRegistration sets isActive to false', async () => {
      const { repo } = buildHarness([memberWithAll]);
      const reg = await repo.upsertDeviceRegistration({
        memberId: MEMBER_A,
        deviceToken: 'token-to-remove',
        platform: 'ios',
        isActive: true,
      });
      await repo.deactivateDeviceRegistration(reg.registrationId);

      const devices = await repo.getActiveDeviceRegistrations(MEMBER_A);
      expect(devices).toHaveLength(0);
    });
  });
});
