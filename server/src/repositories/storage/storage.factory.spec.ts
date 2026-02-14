/**
 * Storage Backend Factory Unit Tests
 *
 * These are pure unit tests (no LocalStack needed).
 */

import { LocalStorageBackend } from 'src/repositories/storage/local.backend';
import { S3StorageBackend } from 'src/repositories/storage/s3.backend';
import { StorageBackendFactory } from 'src/repositories/storage/storage.factory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('StorageBackendFactory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    StorageBackendFactory.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    StorageBackendFactory.reset();
  });

  describe('createFromEnv', () => {
    it('should create LocalStorageBackend by default', () => {
      delete process.env.IMMICH_STORAGE_BACKEND;

      const backend = StorageBackendFactory.createFromEnv();
      expect(backend).toBeInstanceOf(LocalStorageBackend);
      expect(backend.type).toBe('local');
    });

    it('should create LocalStorageBackend when IMMICH_STORAGE_BACKEND=local', () => {
      process.env.IMMICH_STORAGE_BACKEND = 'local';

      const backend = StorageBackendFactory.createFromEnv();
      expect(backend).toBeInstanceOf(LocalStorageBackend);
    });

    it('should create S3StorageBackend when IMMICH_STORAGE_BACKEND=s3', () => {
      process.env.IMMICH_STORAGE_BACKEND = 's3';
      process.env.IMMICH_S3_BUCKET = 'test-bucket';
      process.env.IMMICH_S3_REGION = 'us-east-1';

      const backend = StorageBackendFactory.createFromEnv();
      expect(backend).toBeInstanceOf(S3StorageBackend);
      expect(backend.type).toBe('s3');
    });

    it('should throw for unknown backend type', () => {
      process.env.IMMICH_STORAGE_BACKEND = 'gcs';

      expect(() => StorageBackendFactory.createFromEnv()).toThrow();
    });

    it('should return singleton instance on subsequent calls', () => {
      const first = StorageBackendFactory.createFromEnv();
      const second = StorageBackendFactory.createFromEnv();
      expect(first).toBe(second);
    });

    it('should pass S3 config from env vars', () => {
      process.env.IMMICH_STORAGE_BACKEND = 's3';
      process.env.IMMICH_S3_BUCKET = 'my-bucket';
      process.env.IMMICH_S3_REGION = 'eu-west-1';
      process.env.IMMICH_S3_ENDPOINT = 'http://localhost:4566';
      process.env.IMMICH_S3_ACCESS_KEY = 'mykey';
      process.env.IMMICH_S3_SECRET_KEY = 'mysecret';
      process.env.IMMICH_S3_FORCE_PATH_STYLE = 'true';
      process.env.IMMICH_STORAGE_PREFIX = 'tenant-1/';

      const backend = StorageBackendFactory.createFromEnv();
      expect(backend).toBeInstanceOf(S3StorageBackend);
    });
  });
});
