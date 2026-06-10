import { ServiceBusClient, ServiceBusReceiver, ProcessErrorArgs } from '@azure/service-bus';
import type { Logger } from '@loyalty/shared-logger';
import { EventEnvelope } from './schemas';

export interface ServiceBusSubscriberOptions {
  connectionString: string;
  logger: Logger;
}

export interface SubscribeOptions {
  maxDeliveryCount?: number;
  deadLetterOnProcessFailure?: boolean;
}

export type EventHandler<T = unknown> = (envelope: EventEnvelope<T>) => Promise<void>;

export class ServiceBusSubscriber {
  private client: ServiceBusClient;
  private receivers: ServiceBusReceiver[] = [];
  private logger: Logger;

  constructor(opts: ServiceBusSubscriberOptions) {
    this.client = new ServiceBusClient(opts.connectionString);
    this.logger = opts.logger;
  }

  public subscribe<T>(
    topic: string,
    subscriptionName: string,
    handler: EventHandler<T>,
    options: SubscribeOptions = {},
  ): void {
    const receiver = this.client.createReceiver(topic, subscriptionName);
    this.receivers.push(receiver);

    receiver.subscribe({
      processMessage: async (msg) => {
        const envelope = msg.body as EventEnvelope<T>;
        try {
          await handler(envelope);
        } catch (err) {
          this.logger.error(
            { err, topic, subscriptionName, eventId: envelope?.eventId },
            'event.handler.failed',
          );
          if (options.deadLetterOnProcessFailure !== false) {
            throw err;
          }
        }
      },
      processError: async (args: ProcessErrorArgs) => {
        this.logger.error(
          { err: args.error, source: args.errorSource, topic, subscriptionName },
          'subscriber.error',
        );
      },
    });

    this.logger.info({ topic, subscriptionName, ...options }, 'subscriber.started');
  }

  public async close(): Promise<void> {
    for (const r of this.receivers) {
      await r.close();
    }
    this.receivers = [];
    await this.client.close();
  }
}
