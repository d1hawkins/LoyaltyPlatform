import { randomUUID } from 'crypto';
import type { Logger } from '@loyalty/shared-logger';
import { NotFoundError, ValidationError } from '@loyalty/shared-errors';
import { encrypt, hashRecipient } from '@loyalty/shared-pii';
import type { NotificationRepository } from './repository';
import type { TemplateLoader } from './templates';
import type { EmailProvider } from './providers';
import type { PushProvider } from './providers/push-provider';
import type { SmsProvider } from './providers/sms-provider';
import type { MemberClient } from './member-client';
import type {
  Channel,
  MemberContact,
  NotificationLogEntry,
  SendRequest,
  TemplateVariables,
} from './types';
import { isAllowed } from './preferences';

export interface NotificationServiceConfig {
  piiKeyHex: string;
  recipientPepper: string;
  fromEmail: string;
  supportEmail: string;
  programName: string;
  tenantName: string;
  unsubscribeBaseUrl: string;
  defaultLocale?: string;
}

export interface SendResult {
  notificationId: string;
  status: 'sent' | 'suppressed' | 'failed';
  providerMessageId?: string | null;
  error?: string | null;
}

export class NotificationService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly templates: TemplateLoader,
    private readonly emailProvider: EmailProvider,
    private readonly memberClient: MemberClient,
    private readonly config: NotificationServiceConfig,
    private readonly logger: Logger,
    private readonly pushProvider?: PushProvider,
    private readonly smsProvider?: SmsProvider,
  ) {}

  public async send(tenantId: string, req: SendRequest): Promise<SendResult> {
    if (!req.memberId) throw new ValidationError('memberId is required');
    if (!req.templateKey) throw new ValidationError('templateKey is required');
    if (!req.channel) throw new ValidationError('channel is required');

    if (!this.templates.hasTemplate(req.templateKey)) {
      throw new NotFoundError(`template '${req.templateKey}' not found`);
    }

    const member = await this.memberClient.getMemberContact(tenantId, req.memberId);
    if (!member) throw new NotFoundError(`member ${req.memberId} not found`);

    // Channel-specific dispatch
    switch (req.channel) {
      case 'email':
        return this.dispatchEmail(tenantId, req, member);
      case 'sms':
        return this.dispatchSms(tenantId, req, member);
      case 'push':
        return this.dispatchPush(tenantId, req, member);
      default:
        throw new ValidationError(`channel '${req.channel}' not supported`);
    }
  }

  private async dispatchEmail(
    tenantId: string,
    req: SendRequest,
    member: MemberContact,
  ): Promise<SendResult> {
    const recipient = member.email;
    if (!recipient) {
      throw new ValidationError(`member ${req.memberId} has no email address`);
    }

    const locale = req.locale ?? member.locale ?? this.config.defaultLocale ?? 'en-US';
    const notificationId = randomUUID();
    const createdAt = new Date().toISOString();

    const allowed = await isAllowed(
      this.repo,
      req.memberId,
      req.templateKey,
      req.channel,
    );

    const recipientCiphertext = encrypt(recipient, this.config.piiKeyHex);
    const recipientHashVal = hashRecipient(recipient, this.config.recipientPepper);

    const baseEntry: NotificationLogEntry = {
      notificationId,
      memberId: req.memberId,
      channel: req.channel,
      templateKey: req.templateKey,
      subject: null,
      bodyPreview: null,
      recipientCiphertext,
      recipientHash: recipientHashVal,
      status: 'pending',
      provider: this.emailProvider.name(),
      providerMessageId: null,
      error: null,
      triggeredByEventId: req.triggeredByEventId ?? null,
      locale,
      createdAt,
      sentAt: null,
    };

    if (!allowed) {
      const entry = { ...baseEntry, status: 'suppressed' as const };
      await this.repo.insertLog(entry);
      this.logger.info(
        { notificationId, memberId: req.memberId, templateKey: req.templateKey },
        'notification.suppressed',
      );
      return { notificationId, status: 'suppressed' };
    }

    const variables = this.buildVariables(member, req.variables);
    const rendered = this.templates.render(req.templateKey, locale, variables);
    const preview = rendered.text.slice(0, 1000);

    await this.repo.insertLog({
      ...baseEntry,
      subject: rendered.subject,
      bodyPreview: preview,
    });

    try {
      const result = await this.emailProvider.send({
        to: recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        from: this.config.fromEmail,
        replyTo: this.config.supportEmail,
      });
      await this.repo.updateLogStatus(notificationId, {
        status: 'sent',
        providerMessageId: result.providerMessageId,
        sentAt: new Date().toISOString(),
      });
      this.logger.info(
        { notificationId, templateKey: req.templateKey, providerMessageId: result.providerMessageId },
        'notification.sent',
      );
      return { notificationId, status: 'sent', providerMessageId: result.providerMessageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.updateLogStatus(notificationId, {
        status: 'failed',
        error: message,
      });
      this.logger.error(
        { notificationId, templateKey: req.templateKey, err },
        'notification.failed',
      );
      return { notificationId, status: 'failed', error: message };
    }
  }

  private async dispatchSms(
    _tenantId: string,
    req: SendRequest,
    member: MemberContact,
  ): Promise<SendResult> {
    if (!this.smsProvider) {
      throw new ValidationError('SMS provider not configured');
    }

    const phone = member.phone;
    if (!phone) {
      throw new ValidationError(`member ${req.memberId} has no phone number`);
    }

    const locale = req.locale ?? member.locale ?? this.config.defaultLocale ?? 'en-US';
    const notificationId = randomUUID();
    const createdAt = new Date().toISOString();

    const allowed = await isAllowed(
      this.repo,
      req.memberId,
      req.templateKey,
      req.channel,
    );

    const recipientCiphertext = encrypt(phone, this.config.piiKeyHex);
    const recipientHashVal = hashRecipient(phone, this.config.recipientPepper);

    const baseEntry: NotificationLogEntry = {
      notificationId,
      memberId: req.memberId,
      channel: 'sms',
      templateKey: req.templateKey,
      subject: null,
      bodyPreview: null,
      recipientCiphertext,
      recipientHash: recipientHashVal,
      status: 'pending',
      provider: this.smsProvider.name(),
      providerMessageId: null,
      error: null,
      triggeredByEventId: req.triggeredByEventId ?? null,
      locale,
      createdAt,
      sentAt: null,
    };

    if (!allowed) {
      const entry = { ...baseEntry, status: 'suppressed' as const };
      await this.repo.insertLog(entry);
      this.logger.info(
        { notificationId, memberId: req.memberId, templateKey: req.templateKey, channel: 'sms' },
        'notification.suppressed',
      );
      return { notificationId, status: 'suppressed' };
    }

    const variables = this.buildVariables(member, req.variables);
    const rendered = this.templates.render(req.templateKey, locale, variables);
    const preview = rendered.text.slice(0, 160); // SMS preview length

    await this.repo.insertLog({
      ...baseEntry,
      subject: rendered.subject,
      bodyPreview: preview,
    });

    try {
      const result = await this.smsProvider.send({
        to: phone,
        body: rendered.text,
      });
      await this.repo.updateLogStatus(notificationId, {
        status: 'sent',
        providerMessageId: result.messageId,
        sentAt: new Date().toISOString(),
      });
      this.logger.info(
        { notificationId, templateKey: req.templateKey, channel: 'sms', providerMessageId: result.messageId },
        'notification.sms.sent',
      );
      return { notificationId, status: 'sent', providerMessageId: result.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.updateLogStatus(notificationId, {
        status: 'failed',
        error: message,
      });
      this.logger.error(
        { notificationId, templateKey: req.templateKey, channel: 'sms', err },
        'notification.sms.failed',
      );
      return { notificationId, status: 'failed', error: message };
    }
  }

  private async dispatchPush(
    _tenantId: string,
    req: SendRequest,
    member: MemberContact,
  ): Promise<SendResult> {
    if (!this.pushProvider) {
      throw new ValidationError('Push provider not configured');
    }

    const devices = await this.repo.getActiveDeviceRegistrations(req.memberId);
    if (devices.length === 0) {
      throw new ValidationError(`member ${req.memberId} has no registered devices`);
    }

    const locale = req.locale ?? member.locale ?? this.config.defaultLocale ?? 'en-US';
    const notificationId = randomUUID();
    const createdAt = new Date().toISOString();

    const allowed = await isAllowed(
      this.repo,
      req.memberId,
      req.templateKey,
      req.channel,
    );

    // For push, we use a placeholder for recipient encryption since there's no single address
    const recipientPlaceholder = `push:${req.memberId}:${devices.length}devices`;
    const recipientCiphertext = encrypt(recipientPlaceholder, this.config.piiKeyHex);
    const recipientHashVal = hashRecipient(recipientPlaceholder, this.config.recipientPepper);

    const baseEntry: NotificationLogEntry = {
      notificationId,
      memberId: req.memberId,
      channel: 'push',
      templateKey: req.templateKey,
      subject: null,
      bodyPreview: null,
      recipientCiphertext,
      recipientHash: recipientHashVal,
      status: 'pending',
      provider: this.pushProvider.name(),
      providerMessageId: null,
      error: null,
      triggeredByEventId: req.triggeredByEventId ?? null,
      locale,
      createdAt,
      sentAt: null,
    };

    if (!allowed) {
      const entry = { ...baseEntry, status: 'suppressed' as const };
      await this.repo.insertLog(entry);
      this.logger.info(
        { notificationId, memberId: req.memberId, templateKey: req.templateKey, channel: 'push' },
        'notification.suppressed',
      );
      return { notificationId, status: 'suppressed' };
    }

    const variables = this.buildVariables(member, req.variables);
    const rendered = this.templates.render(req.templateKey, locale, variables);
    const preview = rendered.text.slice(0, 200);

    await this.repo.insertLog({
      ...baseEntry,
      subject: rendered.subject,
      bodyPreview: preview,
    });

    try {
      // Send to all active devices; use the last message ID as the canonical one
      let lastMessageId = '';
      for (const device of devices) {
        const result = await this.pushProvider.send({
          deviceToken: device.deviceToken,
          platform: device.platform,
          title: rendered.subject,
          body: rendered.text,
          data: req.variables ? Object.fromEntries(
            Object.entries(req.variables).map(([k, v]) => [k, String(v)]),
          ) : undefined,
        });
        lastMessageId = result.messageId;
      }
      await this.repo.updateLogStatus(notificationId, {
        status: 'sent',
        providerMessageId: lastMessageId,
        sentAt: new Date().toISOString(),
      });
      this.logger.info(
        { notificationId, templateKey: req.templateKey, channel: 'push', deviceCount: devices.length, providerMessageId: lastMessageId },
        'notification.push.sent',
      );
      return { notificationId, status: 'sent', providerMessageId: lastMessageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.updateLogStatus(notificationId, {
        status: 'failed',
        error: message,
      });
      this.logger.error(
        { notificationId, templateKey: req.templateKey, channel: 'push', err },
        'notification.push.failed',
      );
      return { notificationId, status: 'failed', error: message };
    }
  }

  public async logEventAsPending(
    tenantId: string,
    req: SendRequest,
  ): Promise<string> {
    // Used for points_earned_digest: write a pending log row, do NOT dispatch.
    const member = await this.memberClient.getMemberContact(tenantId, req.memberId);
    if (!member || !member.email) {
      this.logger.warn(
        { memberId: req.memberId, templateKey: req.templateKey },
        'notification.pending.no_recipient',
      );
      return '';
    }
    const notificationId = randomUUID();
    const entry: NotificationLogEntry = {
      notificationId,
      memberId: req.memberId,
      channel: req.channel,
      templateKey: req.templateKey,
      subject: null,
      bodyPreview: null,
      recipientCiphertext: encrypt(member.email, this.config.piiKeyHex),
      recipientHash: hashRecipient(member.email, this.config.recipientPepper),
      status: 'pending',
      provider: null,
      providerMessageId: null,
      error: null,
      triggeredByEventId: req.triggeredByEventId ?? null,
      locale: req.locale ?? member.locale ?? 'en-US',
      createdAt: new Date().toISOString(),
      sentAt: null,
    };
    await this.repo.insertLog(entry);
    return notificationId;
  }

  private buildVariables(
    member: MemberContact,
    supplied: TemplateVariables | undefined,
  ): TemplateVariables {
    const memberName = [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Member';
    return {
      memberName,
      memberId: member.memberId,
      tenantName: this.config.tenantName,
      programName: this.config.programName,
      supportEmail: this.config.supportEmail,
      unsubscribeUrl: `${this.config.unsubscribeBaseUrl}?m=${encodeURIComponent(member.memberId)}`,
      ...(supplied ?? {}),
    };
  }

  public getTemplates(): string[] {
    return this.templates.listTemplates();
  }

  public async listLog(query: {
    memberId?: string;
    status?: NotificationLogEntry['status'];
    limit?: number;
    offset?: number;
  }) {
    const rows = await this.repo.listLog(query);
    // Never return raw recipient blob — return hash + metadata only.
    return rows.map((r) => ({
      notificationId: r.notificationId,
      memberId: r.memberId,
      channel: r.channel,
      templateKey: r.templateKey,
      subject: r.subject,
      bodyPreview: r.bodyPreview,
      recipientHash: r.recipientHash,
      status: r.status,
      provider: r.provider,
      providerMessageId: r.providerMessageId,
      error: r.error,
      triggeredByEventId: r.triggeredByEventId,
      locale: r.locale,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
    }));
  }

  public async updatePreference(
    memberId: string,
    templateKey: string,
    channel: Channel,
    optedIn: boolean,
  ) {
    await this.repo.upsertPreference({
      memberId,
      templateKey,
      channel,
      optedIn,
      updatedAt: new Date().toISOString(),
    });
  }
}
