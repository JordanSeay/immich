/**
 * S3 Storage Backend Integration Tests
 *
 * These tests run against a real LocalStack S3 instance.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   (wait for localstack-test-init to complete)
 *
 * Run:
 *   npx vitest --config test/vitest.config.storage.mjs
 */

import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { S3BackendConfig, S3StorageBackend } from 'src/repositories/storage/s3.backend';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_CONFIG: S3BackendConfig = {
  bucket: 'immich-test-media',
  region: 'us-east-1',
  endpoint: 'http://localhost:4567',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  forcePathStyle: true,
  prefix: '',
};

async function waitForLocalStack(maxRetries = 30): Promise<void> {
  const client = new S3Client({
    region: TEST_CONFIG.region,
    endpoint: TEST_CONFIG.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });

  for (let i = 0; i < maxRetries; i++) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: TEST_CONFIG.bucket }));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('LocalStack S3 not available after retries');
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

let backend: S3StorageBackend;
const testPrefix = `test-${Date.now()}-${randomUUID().slice(0, 8)}/`;

describe('S3StorageBackend', () => {
  beforeAll(async () => {
    await waitForLocalStack();
    backend = new S3StorageBackend({ ...TEST_CONFIG, prefix: testPrefix });
  });

  afterAll(async () => {
    // Clean up test objects
    try {
      const files = await backend.readdir('');
      for (const file of files) {
        await backend.unlink(file);
      }
    } catch {
      // Best effort cleanup
    }
  });

  // =========================================================================
  // writeFile / readFile
  // =========================================================================

  describe('writeFile / readFile', () => {
    it('should write and read a file', async () => {
      const content = Buffer.from('Hello, S3 world!');
      const filepath = 'upload/test-user/ab/cd/test-file.txt';

      await backend.writeFile(filepath, content);
      const result = await backend.readFile(filepath);

      expect(result).toEqual(content);
    });

    it('should overwrite existing file when overwrite=true', async () => {
      const filepath = 'upload/test-user/overwrite-test.txt';
      await backend.writeFile(filepath, Buffer.from('version1'));
      await backend.writeFile(filepath, Buffer.from('version2'), { overwrite: true });

      const result = await backend.readFile(filepath);
      expect(result.toString()).toBe('version2');
    });

    it('should handle binary data', async () => {
      const filepath = 'upload/test-user/binary-test.bin';
      const data = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

      await backend.writeFile(filepath, data);
      const result = await backend.readFile(filepath);

      expect(result).toEqual(data);
    });

    it('should handle empty file', async () => {
      const filepath = 'upload/test-user/empty.txt';
      await backend.writeFile(filepath, Buffer.alloc(0));
      const result = await backend.readFile(filepath);
      expect(result.length).toBe(0);
    });

    it('should handle large file (1MB)', async () => {
      const filepath = 'upload/test-user/large-test.bin';
      const data = Buffer.alloc(1024 * 1024, 0xab);

      await backend.writeFile(filepath, data);
      const result = await backend.readFile(filepath);

      expect(result.length).toBe(data.length);
      expect(result[0]).toBe(0xab);
      expect(result[result.length - 1]).toBe(0xab);
    });
  });

  // =========================================================================
  // Streams
  // =========================================================================

  describe('createReadStream / createWriteStream', () => {
    it('should write via stream and read back', async () => {
      const filepath = 'upload/test-user/stream-test.txt';
      const content = 'Streaming content here';

      // Write via stream
      const writable = backend.createWriteStream(filepath);
      const readable = Readable.from([content]);
      readable.pipe(writable);

      // Wait for the S3 upload to actually complete (not just local buffering)
      await (writable as any).uploadPromise;

      // Read via stream
      const readStream = backend.createReadStream(filepath);
      const result = await streamToBuffer(readStream);
      expect(result.toString()).toBe(content);
    });
  });

  // =========================================================================
  // File operations
  // =========================================================================

  describe('copyFile', () => {
    it('should copy a file to a new location', async () => {
      const source = 'upload/test-user/copy-source.txt';
      const target = 'upload/test-user/copy-target.txt';
      const content = Buffer.from('copy me');

      await backend.writeFile(source, content);
      await backend.copyFile(source, target);

      const result = await backend.readFile(target);
      expect(result).toEqual(content);

      // Source still exists
      const sourceResult = await backend.readFile(source);
      expect(sourceResult).toEqual(content);
    });
  });

  describe('rename', () => {
    it('should move a file (copy + delete)', async () => {
      const source = 'upload/test-user/rename-source.txt';
      const target = 'upload/test-user/rename-target.txt';
      const content = Buffer.from('move me');

      await backend.writeFile(source, content);
      await backend.rename(source, target);

      // Target has the content
      const result = await backend.readFile(target);
      expect(result).toEqual(content);

      // Source no longer exists
      const exists = await backend.checkFileExists(source);
      expect(exists).toBe(false);
    });
  });

  describe('unlink', () => {
    it('should delete a file', async () => {
      const filepath = 'upload/test-user/delete-me.txt';
      await backend.writeFile(filepath, Buffer.from('delete'));

      await backend.unlink(filepath);

      const exists = await backend.checkFileExists(filepath);
      expect(exists).toBe(false);
    });

    it('should not throw when deleting non-existent file', async () => {
      await expect(backend.unlink('upload/test-user/nonexistent.txt')).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // Metadata
  // =========================================================================

  describe('stat', () => {
    it('should return file metadata', async () => {
      const filepath = 'upload/test-user/stat-test.txt';
      const content = Buffer.from('stat me');
      await backend.writeFile(filepath, content);

      const stats = await backend.stat(filepath);

      expect(stats.size).toBe(content.length);
      expect(stats.mtime).toBeInstanceOf(Date);
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });
  });

  describe('checkFileExists', () => {
    it('should return true for existing file', async () => {
      const filepath = 'upload/test-user/exists-test.txt';
      await backend.writeFile(filepath, Buffer.from('exists'));

      const exists = await backend.checkFileExists(filepath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await backend.checkFileExists('upload/test-user/does-not-exist.txt');
      expect(exists).toBe(false);
    });
  });

  // =========================================================================
  // Directory operations (mostly no-ops for S3)
  // =========================================================================

  describe('directory operations', () => {
    it('mkdirSync should be a no-op', () => {
      // Should not throw
      backend.mkdirSync('upload/test-user/some/nested/dir');
    });

    it('existsSync should return true (since mkdir is no-op)', () => {
      expect(backend.existsSync('upload/test-user/any/path')).toBe(true);
    });

    it('removeEmptyDirs should be a no-op', async () => {
      await expect(backend.removeEmptyDirs('upload/test-user/some/dir')).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // readdir
  // =========================================================================

  describe('readdir', () => {
    it('should list files with a common prefix', async () => {
      const dir = 'upload/test-user/readdir-test';
      await backend.writeFile(`${dir}/file-a.txt`, Buffer.from('a'));
      await backend.writeFile(`${dir}/file-b.txt`, Buffer.from('b'));
      await backend.writeFile(`${dir}/file-c.txt`, Buffer.from('c'));

      const files = await backend.readdir(dir);
      expect(files).toHaveLength(3);
      expect(files.sort()).toEqual(['file-a.txt', 'file-b.txt', 'file-c.txt']);
    });

    it('should return empty array for non-existent prefix', async () => {
      const files = await backend.readdir('upload/test-user/nonexistent-dir');
      expect(files).toEqual([]);
    });
  });

  // =========================================================================
  // Multi-tenant prefix
  // =========================================================================

  describe('multi-tenant prefix', () => {
    it('should isolate data between tenants', async () => {
      const tenantA = new S3StorageBackend({ ...TEST_CONFIG, prefix: 'tenant-a/' });
      const tenantB = new S3StorageBackend({ ...TEST_CONFIG, prefix: 'tenant-b/' });

      await tenantA.writeFile('upload/shared-name.txt', Buffer.from('tenant A data'));
      await tenantB.writeFile('upload/shared-name.txt', Buffer.from('tenant B data'));

      const resultA = await tenantA.readFile('upload/shared-name.txt');
      const resultB = await tenantB.readFile('upload/shared-name.txt');

      expect(resultA.toString()).toBe('tenant A data');
      expect(resultB.toString()).toBe('tenant B data');

      // Cleanup
      await tenantA.unlink('upload/shared-name.txt');
      await tenantB.unlink('upload/shared-name.txt');
    });
  });

  // =========================================================================
  // Path handling
  // =========================================================================

  describe('path handling', () => {
    it('should handle paths with leading slashes', async () => {
      const filepath = '/upload/test-user/leading-slash.txt';
      await backend.writeFile(filepath, Buffer.from('leading'));
      const result = await backend.readFile(filepath);
      expect(result.toString()).toBe('leading');
    });

    it('should strip "data/" prefix from paths', async () => {
      const filepath = 'data/upload/test-user/data-prefix.txt';
      await backend.writeFile(filepath, Buffer.from('data prefix'));

      // Should be readable without the data/ prefix
      const result = await backend.readFile('upload/test-user/data-prefix.txt');
      expect(result.toString()).toBe('data prefix');
    });
  });

  // =========================================================================
  // Disk usage
  // =========================================================================

  describe('checkDiskUsage', () => {
    it('should return usage stats', async () => {
      const usage = await backend.checkDiskUsage('upload');
      expect(usage.total).toBeGreaterThan(0);
      expect(usage.available).toBeGreaterThan(0);
      expect(usage.free).toBeGreaterThan(0);
    });
  });
});
