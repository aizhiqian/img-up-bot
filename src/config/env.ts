import { LogLevel } from '../utils/logger';

export interface AppEnv {
  nodeEnv: string;
  port: number;
  telegramBotToken: string;
  telegramWebhookUrl: string;
  telegramAllowedChatIds: Set<string>;
  imgbedBaseUrl: string;
  imgbedUploadToken: string;
  imgbedUploadPath: string;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  maxUploadBytes: number;
  logLevel: LogLevel;
  enableChannelReply: boolean;
  channelReplyTemplate?: string;
  dedupStoreType: 'memory' | 'redis';
}

function requireString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseNumber(name: string, fallback: number, options: { min?: number } = {}): number {
  const raw = process.env[name];

  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`Invalid number env ${name}: ${raw}`);
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`Invalid env ${name}: must be >= ${options.min}`);
  }

  return parsed;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  if (raw === 'true' || raw === '1') {
    return true;
  }

  if (raw === 'false' || raw === '0') {
    return false;
  }

  throw new Error(`Invalid boolean env ${name}: ${raw}`);
}

function parseLogLevel(name: string, fallback: LogLevel): LogLevel {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const candidate = raw.toLowerCase();
  if (candidate === 'debug' || candidate === 'info' || candidate === 'warn' || candidate === 'error') {
    return candidate;
  }

  throw new Error(`Invalid LOG_LEVEL: ${raw}`);
}

function parseAllowedChatIds(raw: string): Set<string> {
  const ids = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error('TELEGRAM_ALLOWED_CHAT_IDS is empty');
  }

  return new Set(ids);
}

function parseDedupStoreType(raw: string | undefined): 'memory' | 'redis' {
  const value = raw?.trim() ?? 'memory';
  if (value === 'memory' || value === 'redis') {
    return value;
  }

  throw new Error(`Invalid DEDUP_STORE_TYPE: ${value}`);
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function loadEnv(): AppEnv {
  const telegramAllowedChatIdsRaw = requireString('TELEGRAM_ALLOWED_CHAT_IDS');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseNumber('PORT', 3000, { min: 1 }),
    telegramBotToken: requireString('TELEGRAM_BOT_TOKEN'),
    telegramWebhookUrl: requireString('TELEGRAM_WEBHOOK_URL'),
    telegramAllowedChatIds: parseAllowedChatIds(telegramAllowedChatIdsRaw),
    imgbedBaseUrl: normalizeBaseUrl(requireString('IMGBED_BASE_URL')),
    imgbedUploadToken: requireString('IMGBED_UPLOAD_TOKEN'),
    imgbedUploadPath: process.env.IMGBED_UPLOAD_PATH?.trim() || '/upload',
    requestTimeoutMs: parseNumber('REQUEST_TIMEOUT_MS', 10000, { min: 100 }),
    retryMaxAttempts: parseNumber('RETRY_MAX_ATTEMPTS', 3, { min: 1 }),
    maxUploadBytes: parseNumber('MAX_UPLOAD_BYTES', 20 * 1024 * 1024, { min: 1 }),
    logLevel: parseLogLevel('LOG_LEVEL', 'info'),
    enableChannelReply: parseBoolean('ENABLE_CHANNEL_REPLY', true),
    channelReplyTemplate: optionalString('CHANNEL_REPLY_TEMPLATE'),
    dedupStoreType: parseDedupStoreType(process.env.DEDUP_STORE_TYPE)
  };
}
