import { constants, createReadStream, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { DiskUsageStats, StorageBackend, StorageFileStats } from 'src/repositories/storage/storage.backend';

/**
 * Local filesystem storage backend.
 *
 * This extracts the filesystem-specific operations from StorageRepository
 * into a standalone backend that implements the StorageBackend interface.
 */
export class LocalStorageBackend implements StorageBackend {
  readonly type = 'local' as const;

  realpath(filepath: string): Promise<string> {
    return fs.realpath(filepath);
  }

  readdir(folder: string): Promise<string[]> {
    return fs.readdir(folder);
  }

  copyFile(source: string, target: string): Promise<void> {
    return fs.copyFile(source, target);
  }

  stat(filepath: string): Promise<StorageFileStats> {
    return fs.stat(filepath);
  }

  async writeFile(filepath: string, data: Buffer, options?: { overwrite?: boolean }): Promise<void> {
    const flag = options?.overwrite ? 'w' : 'wx';
    await fs.writeFile(filepath, data, { flag });
  }

  createWriteStream(filepath: string): Writable {
    return createWriteStream(filepath, { flags: 'w' });
  }

  createReadStream(filepath: string): Readable {
    return createReadStream(filepath);
  }

  rename(source: string, target: string): Promise<void> {
    return fs.rename(source, target);
  }

  utimes(filepath: string, atime: Date, mtime: Date): Promise<void> {
    return fs.utimes(filepath, atime, mtime);
  }

  async readFile(filepath: string): Promise<Buffer> {
    const file = await fs.open(filepath);
    try {
      const stats = await file.stat();
      const { buffer } = await file.read({ buffer: Buffer.alloc(stats.size), offset: 0, length: stats.size });
      return buffer as Buffer;
    } finally {
      await file.close();
    }
  }

  async checkFileExists(filepath: string, mode = constants.F_OK): Promise<boolean> {
    try {
      await fs.access(filepath, mode);
      return true;
    } catch {
      return false;
    }
  }

  async unlink(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        // File doesn't exist, that's fine
        return;
      }
      throw error;
    }
  }

  async unlinkDir(dirpath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await fs.rm(dirpath, { ...options, maxRetries: 5, retryDelay: 100 });
  }

  async removeEmptyDirs(directory: string, self: boolean = false): Promise<void> {
    const stats = await fs.lstat(directory);
    if (!stats.isDirectory()) {
      return;
    }

    const files = await fs.readdir(directory);
    await Promise.all(files.map((file) => this.removeEmptyDirs(path.join(directory, file), true)));

    if (self) {
      const updated = await fs.readdir(directory);
      if (updated.length === 0) {
        try {
          await fs.rmdir(directory);
        } catch (error: Error | any) {
          if (error.code !== 'ENOTEMPTY') {
            // Log but don't throw — this is a best-effort cleanup
          }
        }
      }
    }
  }

  mkdirSync(filepath: string): void {
    if (!existsSync(filepath)) {
      mkdirSync(filepath, { recursive: true });
    }
  }

  existsSync(filepath: string): boolean {
    return existsSync(filepath);
  }

  async checkDiskUsage(folder: string): Promise<DiskUsageStats> {
    const stats = await fs.statfs(folder);
    return {
      available: stats.bavail * stats.bsize,
      free: stats.bfree * stats.bsize,
      total: stats.blocks * stats.bsize,
    };
  }
}
