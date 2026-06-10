import { NoopPushProvider, createPushProvider } from '../src/providers/push-provider';
import { NoopSmsProvider, createSmsProvider, maskPhone } from '../src/providers/sms-provider';

describe('PushProvider', () => {
  it('NoopPushProvider captures sends and returns messageId', async () => {
    const p = new NoopPushProvider();
    const result = await p.send({
      deviceToken: 'abc123def456',
      platform: 'ios',
      title: 'Test Title',
      body: 'Test Body',
      data: { key: 'value' },
    });
    expect(result.messageId).toMatch(/^noop-push-/);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0]!.platform).toBe('ios');
    expect(p.sent[0]!.title).toBe('Test Title');
    expect(p.name()).toBe('noop-push');
  });

  it('NoopPushProvider works for android', async () => {
    const p = new NoopPushProvider();
    const result = await p.send({
      deviceToken: 'fcm-token-abc',
      platform: 'android',
      title: 'Android Title',
      body: 'Android Body',
    });
    expect(result.messageId).toMatch(/^noop-push-/);
    expect(p.sent[0]!.platform).toBe('android');
  });

  it('createPushProvider defaults to noop', () => {
    const p = createPushProvider({ PUSH_PROVIDER: 'noop' });
    expect(p.name()).toBe('noop-push');
  });

  it('createPushProvider requires connection string for azure-notification-hub', () => {
    expect(() =>
      createPushProvider({ PUSH_PROVIDER: 'azure-notification-hub' }),
    ).toThrow(/AZURE_NH_CONNECTION_STRING/);
  });

  it('createPushProvider requires hub name for azure-notification-hub', () => {
    expect(() =>
      createPushProvider({
        PUSH_PROVIDER: 'azure-notification-hub',
        AZURE_NH_CONNECTION_STRING: 'Endpoint=sb://test.servicebus.windows.net/',
      }),
    ).toThrow(/AZURE_NH_HUB_NAME/);
  });
});

describe('SmsProvider', () => {
  it('NoopSmsProvider captures sends and returns messageId', async () => {
    const p = new NoopSmsProvider();
    const result = await p.send({
      to: '+15551234567',
      body: 'Hello from loyalty!',
    });
    expect(result.messageId).toMatch(/^noop-sms-/);
    expect(p.sent).toHaveLength(1);
    expect(p.sent[0]!.to).toBe('+15551234567');
    expect(p.sent[0]!.body).toBe('Hello from loyalty!');
    expect(p.name()).toBe('noop-sms');
  });

  it('createSmsProvider defaults to noop', () => {
    const p = createSmsProvider({ SMS_PROVIDER: 'noop' });
    expect(p.name()).toBe('noop-sms');
  });

  it('createSmsProvider requires connection string for azure-comm-sms', () => {
    expect(() =>
      createSmsProvider({ SMS_PROVIDER: 'azure-comm-sms' }),
    ).toThrow(/AZURE_COMM_CONNECTION_STRING/);
  });

  it('createSmsProvider requires from number for azure-comm-sms', () => {
    expect(() =>
      createSmsProvider({
        SMS_PROVIDER: 'azure-comm-sms',
        AZURE_COMM_CONNECTION_STRING: 'endpoint=https://test.communication.azure.com/',
      }),
    ).toThrow(/SMS_FROM_NUMBER/);
  });

  it('maskPhone masks phone numbers', () => {
    expect(maskPhone('+15551234567')).toBe('***4567');
    expect(maskPhone('1234')).toBe('****');
    expect(maskPhone('12345')).toBe('***2345');
  });
});
