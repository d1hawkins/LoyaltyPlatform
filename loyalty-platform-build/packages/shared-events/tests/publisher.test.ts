const sendMessages = jest.fn().mockResolvedValue(undefined);
const closeSender = jest.fn().mockResolvedValue(undefined);
const closeClient = jest.fn().mockResolvedValue(undefined);
const createSender = jest.fn().mockReturnValue({ sendMessages, close: closeSender });

jest.mock('@azure/service-bus', () => ({
  ServiceBusClient: jest.fn().mockImplementation(() => ({
    createSender,
    close: closeClient,
  })),
}));

import { ServiceBusPublisher, EVENT_TYPES } from '../src';
import { createLogger } from '@loyalty/shared-logger';

describe('ServiceBusPublisher', () => {
  const logger = createLogger('test');

  beforeEach(() => {
    sendMessages.mockClear();
    createSender.mockClear();
  });

  it('wraps payload in envelope and sends to topic', async () => {
    const pub = new ServiceBusPublisher({ connectionString: 'Endpoint=sb://x', logger });
    const envelope = await pub.publish(
      'member.enrolled',
      EVENT_TYPES.MEMBER_ENROLLED,
      { memberId: 'm1', channel: 'pos', enrolledAt: 'now', tierId: 't1' },
      'tenant-1',
    );

    expect(envelope.eventId).toBeDefined();
    expect(envelope.eventType).toBe('member.enrolled');
    expect(envelope.tenantId).toBe('tenant-1');
    expect(envelope.version).toBe('1.0');
    expect(envelope.payload.memberId).toBe('m1');
    expect(createSender).toHaveBeenCalledWith('member.enrolled');
    expect(sendMessages).toHaveBeenCalledTimes(1);
  });

  it('caches senders per topic', async () => {
    const pub = new ServiceBusPublisher({ connectionString: 'Endpoint=sb://x', logger });
    await pub.publish('t1', 'e', {}, 'tenant');
    await pub.publish('t1', 'e', {}, 'tenant');
    expect(createSender).toHaveBeenCalledTimes(1);
  });
});
