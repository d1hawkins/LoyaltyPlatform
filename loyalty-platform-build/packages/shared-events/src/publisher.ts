import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '@loyalty/shared-logger';
import { EventEnvelope } from './schemas';

export interface ServiceBusPublisherOptions {
  connectionString: string;
  logger: Logger;
}

export class ServiceBusPublisher {
  private client: ServiceBusClient;
  private senders = new Map<string, ServiceBusSender>();
  private logger: Logger;

  constructor(opts: ServiceBusPublisherOptions) {
    this.client = new ServiceBusClient(opts.connectionString);
    this.logger = opts.logger;
  }

  public async publish<T>(
    topic: string,
    eventType: string,
    payload: T,
    tenantId: string,
  ): Promise<EventEnvelope<T>> {
    const envelope: EventEnvelope<T> = {
      eventId: uuidv4(),
      eventType,
      tenantId,
      timestamp: new Date().toISOString(),
      version: '1.0',
      payload,
    };

    let sender = this.senders.get(topic);
    if (!sender) {
      sender = this.client.createSender(topic);
      this.senders.set(topic, sender);
    }

    await sender.sendMessages({
      body: envelope,
      contentType: 'application/json',
      messageId: envelope.eventId,
      applicationProperties: {
        eventType,
        tenantId,
        version: envelope.version,
      },
    });

    this.logger.debug({ topic, eventType, eventId: envelope.eventId, tenantId }, 'event.published');
    return envelope;
  }

  public async close(): Promise<void> {
    for (const sender of this.senders.values()) {
      await sender.close();
    }
    this.senders.clear();
    await this.client.close();
  }
}
