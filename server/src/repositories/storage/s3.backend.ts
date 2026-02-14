import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough, Readable, Writable } from 'node:stream';
import { DiskUsageStats, StorageBackend, StorageFileStats } from 'src/repositories/storage/storage.backend';

export interface S3BackendConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string; // Multi-tenant prefix (e.g. "tenant-123/")
}

/**
 * S3 storage backend implementation.
 *
 * Translates local filesystem semantics to S3 API calls.
 * Designed to work with both AWS S3 and LocalStack.
 *
 * Key differences from local filesystem:
 * - No real directories (mkdir/removeEmptyDirs are no-ops)
 * - rename = copy + delete (no atomic rename)
 * - Paths become S3 object keys
 */
export class S3StorageBackend implements StorageBackend {
  readonly type = 's3' as const;
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3BackendConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix || '';

    const clientConfig: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle ?? true,
    };

    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * Convert a local-style path to an S3 key.
   * Strips leading slashes and prepends the tenant prefix.
   * e.g. "/data/upload/user-id/ab/cd/file.jpg" → "upload/user-id/ab/cd/file.jpg"
   */
  private toKey(filepath: string): string {
    // Remove leading slashes and any media location prefix
    let key = filepath.replace(/^\/+/, '');

    // If the path starts with "data/", strip it (Docker mount point)
    if (key.startsWith('data/')) {
      key = key.slice(5);
    }

    return this.prefix + key;
  }

  /**
   * Convert an S3 key back to a local-style path.
   */
  private fromKey(key: string): string {
    let path = key;
    if (this.prefix && path.startsWith(this.prefix)) {
      path = path.slice(this.prefix.length);
    }
    return '/' + path;
  }

  createReadStream(filepath: string): Readable {
    const passthrough = new PassThrough();
    const key = this.toKey(filepath);

    // Start the async fetch and pipe to the passthrough stream
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      .then((response) => {
        if (response.Body) {
          (response.Body as Readable).pipe(passthrough);
        } else {
          passthrough.destroy(new Error(`Empty response body for key: ${key}`));
        }
      })
      .catch((error) => {
        passthrough.destroy(error);
      });

    return passthrough;
  }

  createWriteStream(filepath: string): Writable {
    const passthrough = new PassThrough();
    const key = this.toKey(filepath);

    // Use multipart upload for streaming writes
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: passthrough,
      },
    });

    // Track the upload promise so callers can await completion.
    // The 'finish' event on the passthrough fires when data is buffered locally,
    // but 'uploadComplete' fires when S3 has actually committed the object.
    const uploadPromise = upload.done();

    uploadPromise
      .then(() => passthrough.emit('uploadComplete'))
      .catch((error) => passthrough.destroy(error));

    // Attach the promise for programmatic access
    (passthrough as any).uploadPromise = uploadPromise;

    return passthrough;
  }

  async readFile(filepath: string): Promise<Buffer> {
    const key = this.toKey(filepath);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async writeFile(filepath: string, data: Buffer, options?: { overwrite?: boolean }): Promise<void> {
    const key = this.toKey(filepath);

    if (!options?.overwrite) {
      // Check if file exists first (wx flag equivalent)
      const exists = await this.checkFileExists(filepath);
      if (exists) {
        const error: NodeJS.ErrnoException = new Error(`File already exists: ${key}`);
        error.code = 'EEXIST';
        throw error;
      }
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      }),
    );
  }

  async copyFile(source: string, target: string): Promise<void> {
    const sourceKey = this.toKey(source);
    const targetKey = this.toKey(target);

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: targetKey,
      }),
    );
  }

  async rename(source: string, target: string): Promise<void> {
    // S3 doesn't support rename — copy then delete
    await this.copyFile(source, target);
    await this.unlink(source);
  }

  async unlink(filepath: string): Promise<void> {
    const key = this.toKey(filepath);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      // S3 DeleteObject doesn't throw on missing keys, but handle gracefully
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return;
      }
      throw error;
    }
  }

  async unlinkDir(dirpath: string, _options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const prefix = this.toKey(dirpath);
    // Ensure prefix ends with /
    const dirPrefix = prefix.endsWith('/') ? prefix : prefix + '/';

    // List and delete all objects under the prefix
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: dirPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        await Promise.all(
          response.Contents.map((obj) =>
            this.client.send(
              new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key! }),
            ),
          ),
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  async checkFileExists(filepath: string, _mode?: number): Promise<boolean> {
    const key = this.toKey(filepath);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (error instanceof NotFound || (error as any)?.name === 'NotFound' || (error as any)?.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async stat(filepath: string): Promise<StorageFileStats> {
    const key = this.toKey(filepath);
    const response = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const lastModified = response.LastModified || new Date();
    const size = response.ContentLength || 0;

    return {
      size,
      atime: lastModified,
      mtime: lastModified,
      ctime: lastModified,
      birthtime: lastModified,
      isFile: () => true,
      isDirectory: () => false,
    };
  }

  async utimes(_filepath: string, _atime: Date, _mtime: Date): Promise<void> {
    // S3 doesn't support setting access/modification times directly.
    // This is a no-op. Metadata is managed by S3 automatically.
    // For full fidelity, we could copy the object with updated metadata,
    // but that's expensive and unnecessary for Immich's use case.
  }

  mkdirSync(_filepath: string): void {
    // S3 doesn't have real directories — no-op
  }

  existsSync(_filepath: string): boolean {
    // Synchronous existence check is not possible with S3.
    // This is used by mkdirSync in the local backend.
    // Since mkdirSync is also a no-op for S3, this returns true.
    return true;
  }

  async removeEmptyDirs(_directory: string, _self?: boolean): Promise<void> {
    // S3 doesn't have directories — no-op
  }

  async readdir(dirpath: string): Promise<string[]> {
    const prefix = this.toKey(dirpath);
    const dirPrefix = prefix.endsWith('/') ? prefix : prefix + '/';

    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: dirPrefix,
        Delimiter: '/',
      }),
    );

    const files: string[] = [];

    // Add files (objects directly under the prefix)
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          const name = obj.Key.slice(dirPrefix.length);
          if (name && !name.includes('/')) {
            files.push(name);
          }
        }
      }
    }

    // Add "directories" (common prefixes)
    if (response.CommonPrefixes) {
      for (const prefix of response.CommonPrefixes) {
        if (prefix.Prefix) {
          const name = prefix.Prefix.slice(dirPrefix.length).replace(/\/$/, '');
          if (name) {
            files.push(name);
          }
        }
      }
    }

    return files;
  }

  async realpath(filepath: string): Promise<string> {
    // S3 doesn't have symlinks — return the path as-is
    return filepath;
  }

  async checkDiskUsage(_folder: string): Promise<DiskUsageStats> {
    // S3 has effectively unlimited storage
    return {
      available: Number.MAX_SAFE_INTEGER,
      free: Number.MAX_SAFE_INTEGER,
      total: Number.MAX_SAFE_INTEGER,
    };
  }
}
