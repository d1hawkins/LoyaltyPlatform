import type { Logger } from '@loyalty/shared-logger';

export interface SmsSendOptions {
  to: string;
  body: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface SmsProvider {
  name(): string;
  send(opts: SmsSendOptions): Promise<SmsSendResult>;
}

export class NoopSmsProvider implements SmsProvider {
  public readonly sent: SmsSendOptions[] = [];
  constructor(private readonly logger?: Logger) {}

  public name(): string {
    return 'noop-sms';
  }

  public async send(opts: SmsSendOptions): Promise<SmsSendResult> {
    this.sent.push(opts);
    this.logger?.info(
      { to: maskPhone(opts.to) },
      'noop-sms.send',
    );
    return { messageId: `noop-sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

/**
 * Azure Communication Services SMS provider.
 *
 * Stub implementation — requires @azure/communication-sms SDK.
 * Real implementation would use SmsClient to send messages.
 */
export class AzureCommSmsProvider implements SmsProvider {
  constructor(
    private readonly connectionString: string,
    private readonly fromNumber: string,
    private readonly logger?: Logger,
  ) {}

  public name(): string {
    return 'azure-comm-sms';
  }

  public async send(opts: SmsSendOptions): Promise<SmsSendResult> {
    this.logger?.info(
      { to: maskPhone(opts.to) },
      'azure-comm-sms.send',
    );
    // Stub: in production, this would use SmsClient from @azure/communication-sms
    console.log(`[sms] Would send to ${opts.to}: ${opts.body.substring(0, 50)}...`);
    return { messageId: `acs-sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? '***' + phone.slice(-4) : '****';
}

export interface SmsProviderFactoryConfig {
  SMS_PROVIDER: 'noop' | 'azure-comm-sms';
  AZURE_COMM_CONNECTION_STRING?: string;
  SMS_FROM_NUMBER?: string;
}

export function createSmsProvider(
  config: SmsProviderFactoryConfig,
  logger?: Logger,
): SmsProvider {
  if (config.SMS_PROVIDER === 'azure-comm-sms') {
    if (!config.AZURE_COMM_CONNECTION_STRING) {
      throw new Error('AZURE_COMM_CONNECTION_STRING required when SMS_PROVIDER=azure-comm-sms');
    }
    if (!config.SMS_FROM_NUMBER) {
      throw new Error('SMS_FROM_NUMBER required when SMS_PROVIDER=azure-comm-sms');
    }
    return new AzureCommSmsProvider(
      config.AZURE_COMM_CONNECTION_STRING,
      config.SMS_FROM_NUMBER,
      logger,
    );
  }
  return new NoopSmsProvider(logger);
}

export { maskPhone };
