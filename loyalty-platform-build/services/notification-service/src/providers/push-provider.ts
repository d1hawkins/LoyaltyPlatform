import type { Logger } from '@loyalty/shared-logger';

export interface PushSendOptions {
  deviceToken: string;
  platform: 'ios' | 'android';
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  messageId: string;
}

export interface PushProvider {
  name(): string;
  send(opts: PushSendOptions): Promise<PushSendResult>;
}

export class NoopPushProvider implements PushProvider {
  public readonly sent: PushSendOptions[] = [];
  constructor(private readonly logger?: Logger) {}

  public name(): string {
    return 'noop-push';
  }

  public async send(opts: PushSendOptions): Promise<PushSendResult> {
    this.sent.push(opts);
    this.logger?.info(
      { platform: opts.platform, token: opts.deviceToken.substring(0, 8) + '...' },
      'noop-push.send',
    );
    return { messageId: `noop-push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

/**
 * Azure Notification Hubs push provider.
 *
 * Stub implementation — requires @azure/notification-hubs SDK.
 * Real implementation would use NotificationHubsClient to send
 * platform-specific notifications (APNS for iOS, FCM for Android).
 */
export class AzureNotificationHubProvider implements PushProvider {
  constructor(
    private readonly connectionString: string,
    private readonly hubName: string,
    private readonly logger?: Logger,
  ) {}

  public name(): string {
    return 'azure-notification-hub';
  }

  public async send(opts: PushSendOptions): Promise<PushSendResult> {
    this.logger?.info(
      { platform: opts.platform, token: opts.deviceToken.substring(0, 8) + '...' },
      'azure-notification-hub.send',
    );
    // Stub: in production, this would use NotificationHubsClient
    // to send APNS (iOS) or FCM (Android) notifications.
    console.log(`[push] Would send to ${opts.platform} device ${opts.deviceToken.substring(0, 8)}...`);
    return { messageId: `anh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

export interface PushProviderFactoryConfig {
  PUSH_PROVIDER: 'noop' | 'azure-notification-hub';
  AZURE_NH_CONNECTION_STRING?: string;
  AZURE_NH_HUB_NAME?: string;
}

export function createPushProvider(
  config: PushProviderFactoryConfig,
  logger?: Logger,
): PushProvider {
  if (config.PUSH_PROVIDER === 'azure-notification-hub') {
    if (!config.AZURE_NH_CONNECTION_STRING) {
      throw new Error('AZURE_NH_CONNECTION_STRING required when PUSH_PROVIDER=azure-notification-hub');
    }
    if (!config.AZURE_NH_HUB_NAME) {
      throw new Error('AZURE_NH_HUB_NAME required when PUSH_PROVIDER=azure-notification-hub');
    }
    return new AzureNotificationHubProvider(
      config.AZURE_NH_CONNECTION_STRING,
      config.AZURE_NH_HUB_NAME,
      logger,
    );
  }
  return new NoopPushProvider(logger);
}
