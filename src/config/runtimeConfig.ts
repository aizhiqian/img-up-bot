import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../utils/logger';

export interface RuntimeConfig {
  version?: number;
  imgbed?: {
    uploadFolder?: string;
    uploadChannel?: string;
    uploadNameType?: string;
  };
  updatedAt?: string;
  updatedBy?: {
    userId?: string;
    username?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizeRuntimeConfig(input: unknown): RuntimeConfig {
  if (!isRecord(input)) {
    return {};
  }

  const imgbedRaw = input.imgbed;
  const imgbed: RuntimeConfig['imgbed'] = isRecord(imgbedRaw)
    ? {
        uploadFolder: safeString(imgbedRaw.uploadFolder),
        uploadChannel: safeString(imgbedRaw.uploadChannel),
        uploadNameType: safeString(imgbedRaw.uploadNameType)
      }
    : undefined;

  const updatedByRaw = input.updatedBy;
  const updatedBy: RuntimeConfig['updatedBy'] = isRecord(updatedByRaw)
    ? {
        userId: safeString(updatedByRaw.userId),
        username: safeString(updatedByRaw.username)
      }
    : undefined;

  return {
    version: typeof input.version === 'number' ? input.version : undefined,
    imgbed,
    updatedAt: safeString(input.updatedAt),
    updatedBy
  };
}

export async function loadRuntimeConfig(filePath: string, logger: Logger): Promise<RuntimeConfig> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(text) as unknown;
    return normalizeRuntimeConfig(json);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'ENOENT') {
      return {};
    }

    logger.warn('runtime_config_load_failed', {
      file_path: filePath,
      error
    });

    return {};
  }
}

export async function saveRuntimeConfig(filePath: string, config: RuntimeConfig, logger: Logger): Promise<void> {
  const dir = path.dirname(filePath);

  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  const payload = JSON.stringify(config, null, 2);

  try {
    await fs.writeFile(tmpPath, payload, 'utf8');
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    logger.error('runtime_config_save_failed', {
      file_path: filePath,
      error
    });
    throw error;
  }
}

const IMGBED_UPLOAD_QUERY_KEYS = ['uploadFolder', 'uploadChannel', 'uploadNameType'] as const;

type ImgBedUploadOverrides = RuntimeConfig['imgbed'];

export function mergeImgbedUploadPath(envUploadPath: string, overrides: ImgBedUploadOverrides): string {
  if (!overrides) {
    return envUploadPath;
  }

  const parsed = new URL(envUploadPath, 'https://local.invalid');

  for (const key of IMGBED_UPLOAD_QUERY_KEYS) {
    const value = overrides[key];

    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      parsed.searchParams.delete(key);
      continue;
    }

    parsed.searchParams.set(key, trimmed);
  }

  return `${parsed.pathname}${parsed.search}`;
}
