/** Minimal publisher surface used by the member service — easy to mock. */
export interface EventPublisher {
  publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<unknown>;
}

export class NoopEventPublisher implements EventPublisher {
  public published: Array<{
    topic: string;
    eventType: string;
    payload: unknown;
    tenantId: string;
  }> = [];
  public async publish<T>(
    topic: string,
    eventType: string,
    payload: T,
    tenantId: string,
  ): Promise<unknown> {
    this.published.push({ topic, eventType, payload, tenantId });
    return { eventId: 'noop' };
  }
}
