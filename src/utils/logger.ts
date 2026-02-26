export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const REDACT_KEYS = ['token', 'authorization', 'secret', 'password', 'api_key', 'apikey'];

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((needle) => lower.includes(needle));
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && shouldRedactKey(key)) {
    return '[REDACTED]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [entryKey, entryValue] of Object.entries(input)) {
      output[entryKey] = sanitize(entryValue, entryKey);
    }

    return output;
  }

  return value;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVEL_WEIGHT[level];

  function write(entryLevel: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[entryLevel] < threshold) {
      return;
    }

    const payload: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: entryLevel,
      msg: message
    };

    if (fields && Object.keys(fields).length > 0) {
      Object.assign(payload, sanitize(fields) as Record<string, unknown>);
    }

    console.log(JSON.stringify(payload));
  }

  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields)
  };
}
