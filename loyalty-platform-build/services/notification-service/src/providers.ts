import type { Logger } from '@loyalty/shared-logger';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  replyTo?: string;
}

export interface SendEmailResult {
  providerMessageId: string;
}

export interface EmailProvider {
  name(): string;
  send(args: SendEmailArgs): Promise<SendEmailResult>;
}

export class NoopEmailProvider implements EmailProvider {
  public readonly sent: SendEmailArgs[] = [];
  constructor(private readonly logger?: Logger) {}
  public name(): string {
    return 'noop';
  }
  public async send(args: SendEmailArgs): Promise<SendEmailResult> {
    this.sent.push(args);
    this.logger?.info(
      { to: maskForLog(args.to), subject: args.subject },
      'noop-email.send',
    );
    return { providerMessageId: `noop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

/**
 * Azure Communication Services email provider.
 *
 * The `@azure/communication-email` SDK is imported lazily via `require` so
 * the dependency is only loaded when this provider is actually selected —
 * lets us avoid a hard dependency in dev / test where `noop` is the default.
 */
export class AzureCommEmailProvider implements EmailProvider {
  private client: unknown = null;
  constructor(
    private readonly connectionString: string,
    private readonly logger?: Logger,
  ) {}

  public name(): string {
    return 'azure-comm';
  }

  private getClient(): unknown {
    if (this.client) return this.client;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@azure/communication-email') as {
      EmailClient: new (conn: string) => unknown;
    };
    this.client = new mod.EmailClient(this.connectionString);
    return this.client;
  }

  public async send(args: SendEmailArgs): Promise<SendEmailResult> {
    const client = this.getClient() as {
      beginSend: (msg: unknown) => Promise<{ pollUntilDone: () => Promise<{ id: string }> }>;
    };
    const message = {
      senderAddress: args.from,
      content: {
        subject: args.subject,
        plainText: args.text,
        html: args.html,
      },
      recipients: { to: [{ address: args.to }] },
      replyTo: args.replyTo ? [{ address: args.replyTo }] : undefined,
    };
    const poller = await client.beginSend(message);
    const result = await poller.pollUntilDone();
    this.logger?.info({ providerMessageId: result.id }, 'azure-comm.sent');
    return { providerMessageId: result.id };
  }
}

export interface ProviderFactoryConfig {
  EMAIL_PROVIDER: 'noop' | 'azure-comm';
  AZURE_COMM_CONNECTION_STRING?: string;
}

export function createEmailProvider(
  config: ProviderFactoryConfig,
  logger?: Logger,
): EmailProvider {
  if (config.EMAIL_PROVIDER === 'azure-comm') {
    if (!config.AZURE_COMM_CONNECTION_STRING) {
      throw new Error('AZURE_COMM_CONNECTION_STRING required when EMAIL_PROVIDER=azure-comm');
    }
    return new AzureCommEmailProvider(config.AZURE_COMM_CONNECTION_STRING, logger);
  }
  return new NoopEmailProvider(logger);
}

function maskForLog(recipient: string): string {
  if (recipient.includes('@')) {
    const [local, domain] = recipient.split('@');
    const visible = local && local.length > 0 ? local[0] : '*';
    return `${visible}***@${domain ?? '*'}`;
  }
  return recipient.length > 4 ? '***' + recipient.slice(-4) : '****';
}

export { maskForLog };
