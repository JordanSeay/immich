import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SocketIoAdapter } from 'src/enum';
import { asPgPoolSsl, createWebSocketAdapter } from 'src/middleware/websocket.adapter';
import { ConfigRepository } from 'src/repositories/config.repository';
import { mockEnvData } from 'test/repositories/config.repository.mock';
import { Mocked, vi } from 'vitest';

describe('asPgPoolSsl', () => {
  it('should return false for undefined ssl', () => {
    expect(asPgPoolSsl()).toBe(false);
  });

  it('should return false for ssl = false', () => {
    expect(asPgPoolSsl(false)).toBe(false);
  });

  it('should return false for ssl = "allow"', () => {
    expect(asPgPoolSsl('allow')).toBe(false);
  });

  it('should return { rejectUnauthorized: false } for ssl = true', () => {
    expect(asPgPoolSsl(true)).toEqual({ rejectUnauthorized: false });
  });

  it('should return { rejectUnauthorized: false } for ssl = "prefer"', () => {
    expect(asPgPoolSsl('prefer')).toEqual({ rejectUnauthorized: false });
  });

  it('should return { rejectUnauthorized: false } for ssl = "require"', () => {
    expect(asPgPoolSsl('require')).toEqual({ rejectUnauthorized: false });
  });

  it('should return { rejectUnauthorized: true } for ssl = "verify-full"', () => {
    expect(asPgPoolSsl('verify-full')).toEqual({ rejectUnauthorized: true });
  });

  it('should pass through object ssl config unchanged', () => {
    const sslConfig = { ca: 'certificate', rejectUnauthorized: true };
    expect(asPgPoolSsl(sslConfig)).toBe(sslConfig);
  });
});

describe('createWebSocketAdapter', () => {
  let mockApp: Mocked<INestApplication>;
  let mockConfigRepository: Mocked<ConfigRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApp = {
      getHttpServer: vi.fn().mockReturnValue({}),
    } as unknown as Mocked<INestApplication>;

    mockConfigRepository = {
      getEnv: vi.fn(),
    } as unknown as Mocked<ConfigRepository>;
  });

  describe('BroadcastChannel adapter', () => {
    it('should create BroadcastChannel adapter when configured', async () => {
      const envData = mockEnvData({
        socketIo: { adapter: SocketIoAdapter.BroadcastChannel },
      });
      mockConfigRepository.getEnv.mockReturnValue(envData);

      const adapter = await createWebSocketAdapter(mockApp, mockConfigRepository);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(IoAdapter);
    });
  });

  describe('Postgres adapter', () => {
    it('should create Postgres adapter when configured', async () => {
      const testUrl = process.env.IMMICH_TEST_POSTGRES_URL!;
      const baseEnvData = mockEnvData({});
      const envData = mockEnvData({
        socketIo: { adapter: SocketIoAdapter.Postgres },
        database: {
          config: {
            connectionType: 'url',
            url: testUrl,
          },
          skipMigrations: false,
          vectorExtension: baseEnvData.database.vectorExtension,
        },
      });
      mockConfigRepository.getEnv.mockReturnValue(envData);

      const adapter = await createWebSocketAdapter(mockApp, mockConfigRepository);

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(IoAdapter);
    });
  });
});
