import { Stats } from 'node:fs';
import { Readable, Writable } from 'node:stream';

/**
 * Storage backend abstraction layer.
 *
 * This interface defines the contract for file storage operations.
 * Implementations can target local filesystem, S3, or other backends.
 *
 * All paths are relative to the media root (e.g. "upload/user-id/ab/cd/file.jpg").
 * The backend translates these to the appropriate storage location.
 */
export interface StorageBackend {
  /** Unique identifier for this backend type */
  readonly type: 'local' | 's3';

  /**
   * Create a readable stream for a file.
   * @throws if the file does not exist
   */
  createReadStream(filepath: string): Readable;

  /**
   * Create a writable stream to a file.
   * Parent directories are created automatically.
   */
  createWriteStream(filepath: string): Writable;

  /**
   * Read an entire file (or a portion of it) into a buffer.
   * When options with position/length are provided, only that range is read.
   * @throws if the file does not exist
   */
  readFile(
    filepath: string,
    options?: { buffer?: Buffer; position?: number | null; length?: number; offset?: number },
  ): Promise<Buffer>;

  /**
   * Write a buffer to a file, creating it if it doesn't exist.
   * If the file exists, behavior depends on the `overwrite` flag.
   */
  writeFile(filepath: string, data: Buffer, options?: { overwrite?: boolean }): Promise<void>;

  /**
   * Copy a file from source to target path.
   */
  copyFile(source: string, target: string): Promise<void>;

  /**
   * Rename/move a file from source to target path.
   * On S3 this is implemented as copy + delete.
   * @throws EXDEV error if cross-device move is needed (local backend)
   */
  rename(source: string, target: string): Promise<void>;

  /**
   * Delete a file. Does not throw if the file doesn't exist.
   */
  unlink(filepath: string): Promise<void>;

  /**
   * Delete a directory and its contents.
   */
  unlinkDir(dirpath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;

  /**
   * Check if a file exists with the given access mode.
   */
  checkFileExists(filepath: string, mode?: number): Promise<boolean>;

  /**
   * Get file metadata (size, timestamps, etc.).
   * Returns a Stats-compatible object for interoperability with existing code.
   * @throws if the file does not exist
   */
  stat(filepath: string): Promise<Stats>;

  /**
   * Update file access and modification times.
   */
  utimes(filepath: string, atime: Date, mtime: Date): Promise<void>;

  /**
   * Create a directory (and parents) synchronously.
   * On S3 this is a no-op since S3 doesn't have real directories.
   */
  mkdirSync(filepath: string): void;

  /**
   * Check if a path exists synchronously.
   */
  existsSync(filepath: string): boolean;

  /**
   * Remove empty directories recursively.
   * On S3 this is a no-op.
   */
  removeEmptyDirs(directory: string, self?: boolean): Promise<void>;

  /**
   * List files in a directory.
   */
  readdir(dirpath: string): Promise<string[]>;

  /**
   * Resolve symlinks and return the real path.
   */
  realpath(filepath: string): Promise<string>;

  /**
   * Get disk usage statistics.
   * On S3 this returns bucket-level statistics or defaults.
   */
  checkDiskUsage(folder: string): Promise<DiskUsageStats>;
}

export type StorageFileStats = Stats;

export interface DiskUsageStats {
  available: number;
  free: number;
  total: number;
}

/** Storage backend type identifier */
export type StorageBackendType = 'local' | 's3';
