export interface RetryableError extends Error {
  retryable?: boolean;
  status?: number;
}

export function createHttpError(
  message: string,
  options: {
    retryable?: boolean;
    status?: number;
    cause?: unknown;
  } = {}
): RetryableError {
  const error = new Error(message) as RetryableError & { cause?: unknown };

  error.retryable = options.retryable ?? false;

  if (typeof options.status === 'number') {
    error.status = options.status;
  }

  if (options.cause !== undefined) {
    error.cause = options.cause;
  }

  return error;
}

export function isRetryableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'retryable' in error &&
    Boolean((error as RetryableError).retryable)
  );
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createHttpError(`Request timeout: ${url}`, {
        retryable: true,
        cause: error
      });
    }

    throw createHttpError(`Request failed: ${url}`, {
      retryable: true,
      cause: error
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  }
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const shouldRetry = options.shouldRetry ?? isRetryableError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function readJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function truncateText(text: string, maxLength = 300): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}
