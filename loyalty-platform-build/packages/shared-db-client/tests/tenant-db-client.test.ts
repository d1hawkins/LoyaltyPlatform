const mockQuery = jest.fn();
const mockInput = jest.fn().mockReturnThis();
const mockRequest = jest.fn().mockReturnValue({ input: mockInput, query: mockQuery });
const mockConnect = jest.fn();
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('mssql', () => {
  class ConnectionPool {
    public connected = false;
    constructor(public connStr: string) {}
    connect = mockConnect;
    request = mockRequest;
    close = mockClose;
  }
  return {
    ConnectionPool,
    UniqueIdentifier: 'UniqueIdentifier',
  };
});

const getSecret = jest.fn();
jest.mock('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({ getSecret })),
}));
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

import { TenantDbClient } from '../src';
import { TenantNotFoundError } from '@loyalty/shared-errors';
import { createLogger } from '@loyalty/shared-logger';

describe('TenantDbClient', () => {
  const logger = createLogger('test');
  const redisClient = {} as any;
  let client: TenantDbClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockImplementation(async function (this: any) {
      this.connected = true;
      return this;
    });
    client = new TenantDbClient({
      keyVaultUri: 'https://kv.vault.azure.net/',
      redisClient,
      controlPlaneConnectionString: 'Server=cp',
      logger,
    });
  });

  it('getControlPlanePool connects once and caches', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const p1 = await client.getControlPlanePool();
    const p2 = await client.getControlPlanePool();
    expect(p1).toBe(p2);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('getTenantPool throws TenantNotFoundError when record missing', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    await expect(client.getTenantPool('abc')).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('getTenantPool fetches Key Vault secret and connects', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ tenantId: 'abc', slug: 's', status: 'active', dbSecretName: 'n' }],
    });
    getSecret.mockResolvedValue({ value: 'Server=tenant;' });
    const pool = await client.getTenantPool('abc');
    expect(pool).toBeDefined();
    expect(getSecret).toHaveBeenCalledWith('tenant-abc-sql-connstr');
    // cached second call
    const pool2 = await client.getTenantPool('abc');
    expect(pool2).toBe(pool);
    expect(getSecret).toHaveBeenCalledTimes(1);
  });

  it('close() closes all pools', async () => {
    mockQuery.mockResolvedValue({
      recordset: [{ tenantId: 'abc', slug: 's', status: 'active', dbSecretName: 'n' }],
    });
    getSecret.mockResolvedValue({ value: 'Server=tenant;' });
    await client.getTenantPool('abc');
    await client.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
