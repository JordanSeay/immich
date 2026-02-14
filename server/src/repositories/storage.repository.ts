import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import chokidar, { ChokidarOptions } from 'chokidar';
import { escapePath, glob, globStream } from 'fast-glob';
import { constants, ReadOptionsWithBuffer } from 'node:fs';
import fs from 'node:fs/promises';
import { PassThrough, Readable, Writable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import { CrawlOptionsDto, WalkOptionsDto } from 'src/dtos/library.dto';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { StorageBackend } from 'src/repositories/storage/storage.backend';
import { StorageBackendFactory } from 'src/repositories/storage/storage.factory';
import { mimeTypes } from 'src/utils/mime-types';

export interface WatchEvents {
  onReady(): void;
  onAdd(path: string): void;
  onChange(path: string): void;
  onUnlink(path: string): void;
  onError(error: Error): void;
}

export interface ImmichReadStream {
  stream: Readable;
  type?: string;
  length?: number;
}

export interface ImmichZipStream extends ImmichReadStream {
  addFile: (inputPath: string, filename: string) => void;
  finalize: () => Promise<void>;
}

export interface DiskUsage {
  available: number;
  free: number;
  total: number;
}

@Injectable()
export class StorageRepository {
  private backend: StorageBackend;

  constructor(private logger: LoggingRepository) {
    this.logger.setContext(StorageRepository.name);
    this.backend = StorageBackendFactory.createFromEnv();
    this.logger.log(`Storage backend initialized: ${this.backend.type}`);
  }

  /** Get the active storage backend type */
  get backendType(): string {
    return this.backend.type;
  }

  realpath(filepath: string) {
    return this.backend.realpath(filepath);
  }

  readdir(folder: string): Promise<string[]> {
    return this.backend.readdir(folder);
  }

  copyFile(source: string, target: string) {
    return this.backend.copyFile(source, target);
  }

  stat(filepath: string) {
    return this.backend.stat(filepath);
  }

  createFile(filepath: string, buffer: Buffer) {
    return this.backend.writeFile(filepath, buffer, { overwrite: false });
  }

  createWriteStream(filepath: string): Writable {
    return this.backend.createWriteStream(filepath);
  }

  createOrOverwriteFile(filepath: string, buffer: Buffer) {
    return this.backend.writeFile(filepath, buffer, { overwrite: true });
  }

  overwriteFile(filepath: string, buffer: Buffer) {
    return this.backend.writeFile(filepath, buffer, { overwrite: true });
  }

  rename(source: string, target: string) {
    return this.backend.rename(source, target);
  }

  utimes(filepath: string, atime: Date, mtime: Date) {
    return this.backend.utimes(filepath, atime, mtime);
  }

  createZipStream(): ImmichZipStream {
    const archive = archiver('zip', { store: true });

    const addFile = (input: string, filename: string) => {
      archive.file(input, { name: filename, mode: 0o644 });
    };

    const finalize = () => archive.finalize();

    return { stream: archive, addFile, finalize };
  }

  createGzip(): PassThrough {
    return createGzip();
  }

  createGunzip(): PassThrough {
    return createGunzip();
  }

  createPlainReadStream(filepath: string): Readable {
    return this.backend.createReadStream(filepath);
  }

  async createReadStream(filepath: string, mimeType?: string | null): Promise<ImmichReadStream> {
    const stats = await this.backend.stat(filepath);
    return {
      stream: this.backend.createReadStream(filepath),
      length: stats.size,
      type: mimeType || undefined,
    };
  }

  // TODO: Remove direct fs import and delegate fully to backend.readFile().
  // The local backend's readFile already handles the full read; the partial-read
  // path here duplicates logic and couples this class to the filesystem.
  async readFile(filepath: string, options?: ReadOptionsWithBuffer<Buffer>): Promise<Buffer> {
    // For S3 backend, delegate to backend.readFile which handles the full read
    if (this.backend.type === 's3') {
      return this.backend.readFile(filepath);
    }
    // For local backend, preserve the original open/read/close behavior for partial reads
    const file = await fs.open(filepath);
    try {
      const { buffer } = await file.read(options);
      return buffer as Buffer;
    } finally {
      await file.close();
    }
  }

  async readTextFile(filepath: string): Promise<string> {
    if (this.backend.type === 's3') {
      const buffer = await this.backend.readFile(filepath);
      return buffer.toString('utf8');
    }
    return fs.readFile(filepath, 'utf8');
  }

  async checkFileExists(filepath: string, mode = constants.F_OK): Promise<boolean> {
    return this.backend.checkFileExists(filepath, mode);
  }

  async unlink(file: string) {
    try {
      await this.backend.unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.logger.warn(`File ${file} does not exist.`);
      } else {
        throw error;
      }
    }
  }

  async unlinkDir(folder: string, options: { recursive?: boolean; force?: boolean }) {
    return this.backend.unlinkDir(folder, options);
  }

  async removeEmptyDirs(directory: string, self: boolean = false) {
    return this.backend.removeEmptyDirs(directory, self);
  }

  mkdirSync(filepath: string): void {
    this.backend.mkdirSync(filepath);
  }

  existsSync(filepath: string) {
    return this.backend.existsSync(filepath);
  }

  async checkDiskUsage(folder: string): Promise<DiskUsage> {
    return this.backend.checkDiskUsage(folder);
  }

  crawl(crawlOptions: CrawlOptionsDto): Promise<string[]> {
    const { pathsToCrawl, exclusionPatterns, includeHidden } = crawlOptions;
    if (pathsToCrawl.length === 0) {
      return Promise.resolve([]);
    }

    const globbedPaths = pathsToCrawl.map((path) => this.asGlob(path));

    return glob(globbedPaths, {
      absolute: true,
      caseSensitiveMatch: false,
      onlyFiles: true,
      dot: includeHidden,
      ignore: exclusionPatterns,
    });
  }

  async *walk(walkOptions: WalkOptionsDto): AsyncGenerator<string[]> {
    const { pathsToCrawl, exclusionPatterns, includeHidden } = walkOptions;
    if (pathsToCrawl.length === 0) {
      async function* emptyGenerator() {}
      return emptyGenerator();
    }

    const globbedPaths = pathsToCrawl.map((path) => this.asGlob(path));

    const stream = globStream(globbedPaths, {
      absolute: true,
      caseSensitiveMatch: false,
      onlyFiles: true,
      dot: includeHidden,
      ignore: exclusionPatterns,
    });

    let batch: string[] = [];
    for await (const value of stream) {
      batch.push(value.toString());
      if (batch.length === walkOptions.take) {
        yield batch;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield batch;
    }
  }

  watch(paths: string[], options: ChokidarOptions, events: Partial<WatchEvents>) {
    const watcher = chokidar.watch(paths, options);

    watcher.on('ready', () => events.onReady?.());
    watcher.on('add', (path) => events.onAdd?.(path));
    watcher.on('change', (path) => events.onChange?.(path));
    watcher.on('unlink', (path) => events.onUnlink?.(path));
    watcher.on('error', (error) => events.onError?.(error as Error));

    return () => watcher.close();
  }

  private asGlob(pathToCrawl: string): string {
    const escapedPath = escapePath(pathToCrawl).replaceAll('"', '["]').replaceAll("'", "[']").replaceAll('`', '[`]');
    const extensions = `*{${mimeTypes.getSupportedFileExtensions().join(',')}}`;
    return `${escapedPath}/**/${extensions}`;
  }
}
