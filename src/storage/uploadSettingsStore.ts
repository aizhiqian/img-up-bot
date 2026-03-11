import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../utils/logger';

export type UploadSettingsKey = 'uploadNameType' | 'uploadChannel' | 'uploadFolder';

export interface UploadSettings {
  uploadNameType?: string;
  uploadChannel?: string;
  uploadFolder?: string;
}

export interface UploadSettingsStore {
  getOverrides(): Promise<UploadSettings>;
  setKey(key: UploadSettingsKey, value: string): Promise<void>;
  clearKey(key: UploadSettingsKey): Promise<void>;
  clearAll(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function safeTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOverrides(input: unknown): UploadSettings {
  if (!isRecord(input)) {
    return {};
  }

  return {
    uploadNameType: safeTrimmedString(input.uploadNameType),
    uploadChannel: safeTrimmedString(input.uploadChannel),
    uploadFolder: safeTrimmedString(input.uploadFolder)
  };
}

export class JsonFileUploadSettingsStore implements UploadSettingsStore {
  private readonly filePath: string;

  private readonly logger: Logger;

  private loaded = false;

  private overrides: UploadSettings = {};

  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string, logger: Logger) {
    this.filePath = filePath;
    this.logger = logger;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      const json = JSON.parse(text) as unknown;
      this.overrides = normalizeOverrides(json);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'ENOENT') {
        this.overrides = {};
      } else {
        this.logger.warn('upload_settings_load_failed', {
          file_path: this.filePath,
          error
        });
        this.overrides = {};
      }
    } finally {
      this.loaded = true;
    }
  }

  private queueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const payload = JSON.stringify(this.overrides, null, 2);
    await fs.writeFile(this.filePath, payload, 'utf8');
  }

  async getOverrides(): Promise<UploadSettings> {
    await this.ensureLoaded();
    return { ...this.overrides };
  }

  async setKey(key: UploadSettingsKey, value: string): Promise<void> {
    await this.ensureLoaded();

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('value is empty');
    }

    this.overrides = {
      ...this.overrides,
      [key]: trimmed
    };

    await this.queueWrite(() => this.persist());
  }

  async clearKey(key: UploadSettingsKey): Promise<void> {
    await this.ensureLoaded();

    const next: UploadSettings = { ...this.overrides };
    delete next[key];
    this.overrides = next;

    await this.queueWrite(() => this.persist());
  }

  async clearAll(): Promise<void> {
    await this.ensureLoaded();
    this.overrides = {};
    await this.queueWrite(() => this.persist());
  }
}
