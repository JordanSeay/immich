import { LocalStorageBackend } from 'src/repositories/storage/local.backend';
import { S3BackendConfig, S3StorageBackend } from 'src/repositories/storage/s3.backend';
import { StorageBackend, StorageBackendType } from 'src/repositories/storage/storage.backend';

export interface StorageBackendOptions {
  type: StorageBackendType;
  s3?: S3BackendConfig;
}

/**
 * Factory for creating storage backend instances.
 *
 * Reads configuration from environment variables to determine which
 * backend to use (local filesystem or S3).
 *
 * Uses a singleton pattern — the backend is created once on first call to
 * createFromEnv() and reused for the lifetime of the process. Configuration
 * changes (env var updates) require a server restart to take effect.
 * Call reset() in tests to clear the cached instance.
 */
export class StorageBackendFactory {
  private static instance: StorageBackend | null = null;

  /**
   * Create a storage backend from explicit options.
   */
  static create(options: StorageBackendOptions): StorageBackend {
    switch (options.type) {
      case 's3': {
        if (!options.s3) {
          throw new Error('S3 backend requires S3 configuration (bucket, region)');
        }
        return new S3StorageBackend(options.s3);
      }
      case 'local':
      default: {
        return new LocalStorageBackend();
      }
    }
  }

  /**
   * Create a storage backend from environment variables.
   *
   * Environment variables:
   *   IMMICH_STORAGE_BACKEND  - "local" or "s3" (default: "local")
   *   IMMICH_S3_BUCKET        - S3 bucket name (required for S3)
   *   IMMICH_S3_REGION        - AWS region (required for S3)
   *   IMMICH_S3_ENDPOINT      - Custom endpoint URL (for LocalStack)
   *   IMMICH_S3_ACCESS_KEY    - AWS access key (optional, uses IAM role if not set)
   *   IMMICH_S3_SECRET_KEY    - AWS secret key (optional, uses IAM role if not set)
   *   IMMICH_S3_FORCE_PATH_STYLE - Use path-style URLs: "true" or "false" (default: "true", required for LocalStack)
   *   IMMICH_STORAGE_PREFIX   - Key prefix for multi-tenant isolation
   */
  static createFromEnv(): StorageBackend {
    if (this.instance) {
      return this.instance;
    }

    const backendType = process.env.IMMICH_STORAGE_BACKEND || 'local';

    if (backendType !== 'local' && backendType !== 's3') {
      throw new Error(`Unknown storage backend type: '${backendType}'. Supported: 'local', 's3'`);
    }

    if (backendType === 's3') {
      const bucket = process.env.IMMICH_S3_BUCKET;
      const region = process.env.IMMICH_S3_REGION;
      const endpoint = process.env.IMMICH_S3_ENDPOINT;

      if (!bucket || !region) {
        throw new Error(
          'S3 backend requires IMMICH_S3_BUCKET and IMMICH_S3_REGION environment variables. ' +
            'Set IMMICH_STORAGE_BACKEND=local or provide the required S3 configuration.',
        );
      }

      // Validate endpoint URL format if provided
      if (endpoint) {
        try {
          new URL(endpoint);
        } catch {
          throw new Error(
            `Invalid IMMICH_S3_ENDPOINT: '${endpoint}'. Must be a valid URL (e.g., http://localhost:4566)`,
          );
        }
      }

      // Parse forcePathStyle with proper boolean handling
      const forcePathStyleEnv = process.env.IMMICH_S3_FORCE_PATH_STYLE?.toLowerCase();
      const forcePathStyle = forcePathStyleEnv === undefined || forcePathStyleEnv === 'true';

      this.instance = this.create({
        type: 's3',
        s3: {
          bucket,
          region,
          endpoint,
          accessKeyId: process.env.IMMICH_S3_ACCESS_KEY,
          secretAccessKey: process.env.IMMICH_S3_SECRET_KEY,
          forcePathStyle,
          prefix: process.env.IMMICH_STORAGE_PREFIX,
        },
      });
    } else {
      this.instance = this.create({ type: 'local' });
    }

    return this.instance;
  }

  /**
   * Reset the singleton instance. Used for testing.
   */
  static reset(): void {
    this.instance = null;
  }
}
