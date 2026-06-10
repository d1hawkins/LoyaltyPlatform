import { NoopEmailProvider, createEmailProvider, maskForLog } from '../src/providers';

describe('providers', () => {
  it('NoopEmailProvider captures sends', async () => {
    const p = new NoopEmailProvider();
    const r = await p.send({
      to: 'a@b.co',
      subject: 's',
      html: '<p/>',
      text: 't',
      from: 'x@y.z',
    });
    expect(r.providerMessageId).toMatch(/^noop-/);
    expect(p.sent).toHaveLength(1);
    expect(p.name()).toBe('noop');
  });

  it('factory defaults to noop', () => {
    const p = createEmailProvider({ EMAIL_PROVIDER: 'noop' });
    expect(p.name()).toBe('noop');
  });

  it('factory requires conn string for azure-comm', () => {
    expect(() => createEmailProvider({ EMAIL_PROVIDER: 'azure-comm' })).toThrow(
      /AZURE_COMM_CONNECTION_STRING/,
    );
  });

  it('maskForLog masks email local part', () => {
    expect(maskForLog('alice@example.com')).toBe('a***@example.com');
    expect(maskForLog('+15551234567')).toBe('***4567');
    expect(maskForLog('abc')).toBe('****');
  });
});
