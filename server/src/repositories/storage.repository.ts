import { Injectable } from '@nestjs/common';
import archiver from 'archiver';
import chokidar, { ChokidarOptions } from 'chokidar';
import { escapePath, glob, globStream } from 'fast-glob';
import { constants, existsSync, mkdirSync as fsMkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import { CrawlOptionsDto, WalkOptionsDto } from 'src/dtos/library.dto';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { LocalStorageBackend } from 'src/repositories/storage/local.backend';
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
  private localBackend: LocalStorageBackend;
  private mediaLocation: string | null = null;

  constructor(private logger: LoggingRepository) {
    this.logger.setContext(StorageRepository.name);
    this.backend = StorageBackendFactory.createFromEnv();
    this.localBackend = new LocalStorageBackend();

    // Pre-populate from env var if available
    if (process.env.IMMICH_MEDIA_LOCATION) {
      this.mediaLocation = process.env.IMMICH_MEDIA_LOCATION;
    }

    this.logger.log(`Storage backend initialized: ${this.backend.type}`);
  }

  /**
   * Set the resolved media location for path-based backend routing.
   * Called by StorageService after detecting the actual media location.
   * When the configured backend is S3, only paths under the media location
   * are routed to S3; all other paths use the local filesystem.
   */
  setMediaLocation(location: string) {
    this.mediaLocation = location;
    if (this.backend.type !== 'local') {
      this.logger.log(`Media location set for hybrid routing: ${location}`);
    }
  }

  /**
   * Get the appropriate backend for the given file path.
   * Media paths (under the configured media location) go to the configured
   * backend (e.g., S3). All other paths use the local filesystem.
   */
  private getBackend(filepath: string): StorageBackend {
    if (this.backend.type === 'local') {
      return this.backend;
    }

    const mediaLoc = this.mediaLocation;
    if (mediaLoc && filepath.startsWith(mediaLoc)) {
      return this.backend;
    }

    // Before media location is set, or for non-media paths, use local
    return this.localBackend;
  }

  /** Get the active storage backend type */
  get backendType(): string {
    return this.backend.type;
  }

  realpath(filepath: string) {
    return this.getBackend(filepath).realpath(filepath);
  }

  readdir(folder: string): Promise<string[]> {
    return this.getBackend(folder).readdir(folder);
  }

  copyFile(source: string, target: string) {
    return this.getBackend(target).copyFile(source, target);
  }

  stat(filepath: string) {
    return this.getBackend(filepath).stat(filepath);
  }

  createFile(filepath: string, buffer: Buffer) {
    return this.getBackend(filepath).writeFile(filepath, buffer, { overwrite: false });
  }

  createWriteStream(filepath: string): Writable {
    return this.getBackend(filepath).createWriteStream(filepath);
  }

  createOrOverwriteFile(filepath: string, buffer: Buffer) {
    return this.getBackend(filepath).writeFile(filepath, buffer, { overwrite: true });
  }

  overwriteFile(filepath: string, buffer: Buffer) {
    return this.getBackend(filepath).writeFile(filepath, buffer, { overwrite: true });
  }

  rename(source: string, target: string) {
    return this.getBackend(source).rename(source, target);
  }

  utimes(filepath: string, atime: Date, mtime: Date) {
    return this.getBackend(filepath).utimes(filepath, atime, mtime);
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
    return this.getBackend(filepath).createReadStream(filepath);
  }

  async createReadStream(filepath: string, mimeType?: string | null): Promise<ImmichReadStream> {
    const backend = this.getBackend(filepath);
    const stats = await backend.stat(filepath);
    return {
      stream: backend.createReadStream(filepath),
      length: stats.size,
      type: mimeType || undefined,
    };
  }

  async readFile(
    filepath: string,
    options?: { buffer?: Buffer; position?: number | null; length?: number; offset?: number },
  ): Promise<Buffer> {
    return this.getBackend(filepath).readFile(filepath, options);
  }

  async readTextFile(filepath: string): Promise<string> {
    const buffer = await this.getBackend(filepath).readFile(filepath);
    return buffer.toString('utf8');
  }

  async checkFileExists(filepath: string, mode = constants.F_OK): Promise<boolean> {
    return this.getBackend(filepath).checkFileExists(filepath, mode);
  }

  async unlink(file: string) {
    try {
      await this.getBackend(file).unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        this.logger.warn(`File ${file} does not exist.`);
      } else {
        throw error;
      }
    }
  }

  async unlinkDir(folder: string, options: { recursive?: boolean; force?: boolean }) {
    return this.getBackend(folder).unlinkDir(folder, options);
  }

  async removeEmptyDirs(directory: string, self: boolean = false) {
    return this.getBackend(directory).removeEmptyDirs(directory, self);
  }

  mkdirSync(filepath: string): void {
    // Always create directories on the local filesystem, even when the
    // configured backend is S3.  Multer (file upload middleware) writes
    // directly to the local filesystem and requires the directory to exist.
    this.localBackend.mkdirSync(filepath);
  }

  /**
   * Sync a file from the local filesystem to the configured backend.
   * This is used after multer writes a file locally (e.g., during upload)
   * to copy the file to the remote backend (e.g., S3) and clean up the
   * local copy.  No-op when the backend is local.
   */
  async syncLocalFileToBackend(filepath: string): Promise<void> {
    if (this.backend.type === 'local') {
      return;
    }

    const mediaLoc = this.mediaLocation;
    if (!mediaLoc || !filepath.startsWith(mediaLoc)) {
      return;
    }

    const data = await this.localBackend.readFile(filepath);
    await this.backend.writeFile(filepath, data, { overwrite: true });
    await this.localBackend.unlink(filepath);
  }

  /**
   * Ensure a file from the remote backend is available on the local filesystem.
   * Used before media processing tools (sharp, ffmpeg, exiftool) that require
   * direct filesystem access.  If the file is already present locally it is
   * treated as a cache hit and no download occurs.
   *
   * No-op when the backend is local.
   */
  async ensureLocalFile(filepath: string): Promise<void> {
    if (this.backend.type === 'local') {
      return;
    }

    const mediaLoc = this.mediaLocation;
    if (!mediaLoc || !filepath.startsWith(mediaLoc)) {
      // Non-media path – already local
      return;
    }

    // Check if local copy already exists (cache hit)
    if (existsSync(filepath)) {
      return;
    }

    this.logger.debug(`Downloading file from backend for local processing: ${filepath}`);
    const dir = dirname(filepath);
    fsMkdirSync(dir, { recursive: true });

    const data = await this.backend.readFile(filepath);
    await this.localBackend.writeFile(filepath, data, { overwrite: true });
  }

  /**
   * Upload locally-generated files (thumbnails, encoded video) to the remote
   * backend.  The local copies are kept as a cache so that subsequent reads
   * (e.g., serving thumbnails) don't need another download.
   *
   * No-op when the backend is local.
   */
  async syncGeneratedFiles(filepaths: string[]): Promise<void> {
    if (this.backend.type === 'local') {
      return;
    }

    for (const filepath of filepaths) {
      const mediaLoc = this.mediaLocation;
      if (!mediaLoc || !filepath.startsWith(mediaLoc)) {
        continue;
      }

      if (!existsSync(filepath)) {
        this.logger.warn(`Generated file not found locally, skipping sync: ${filepath}`);
        continue;
      }

      this.logger.debug(`Syncing generated file to backend: ${filepath}`);
      const data = await this.localBackend.readFile(filepath);
      await this.backend.writeFile(filepath, data, { overwrite: true });
      // Keep local copy as cache – do NOT delete
    }
  }

  existsSync(filepath: string) {
    return this.getBackend(filepath).existsSync(filepath);
  }

  async checkDiskUsage(folder: string): Promise<DiskUsage> {
    return this.getBackend(folder).checkDiskUsage(folder);
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
