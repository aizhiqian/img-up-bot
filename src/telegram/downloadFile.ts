import { AppEnv } from '../config/env';
import { Logger } from '../utils/logger';
import { createHttpError, fetchWithTimeout, readJsonSafe, truncateText, withRetry } from '../utils/http';

interface TelegramFileResponse {
  ok: boolean;
  result?: {
    file_path?: string;
  };
  description?: string;
}

function buildTelegramApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

function buildTelegramFileUrl(botToken: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

export async function downloadTelegramPhoto(
  fileId: string,
  env: AppEnv,
  logger: Logger
): Promise<{ buffer: Buffer; contentType: string | undefined; filePath: string }> {
  const startedAt = Date.now();

  const getFileResult = await withRetry(
    async () => {
      const response = await fetchWithTimeout(
        buildTelegramApiUrl(env.telegramBotToken, 'getFile'),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ file_id: fileId })
        },
        env.requestTimeoutMs
      );

      const text = await response.text();
      const json = readJsonSafe(text) as TelegramFileResponse | null;

      if (!response.ok) {
        throw createHttpError(`Telegram getFile HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
          status: response.status,
          cause: truncateText(text)
        });
      }

      if (!json || !json.ok || !json.result?.file_path) {
        throw createHttpError(`Telegram getFile invalid response: ${truncateText(text)}`, {
          retryable: false
        });
      }

      return json.result.file_path;
    },
    {
      maxAttempts: env.retryMaxAttempts
    }
  );

  const downloadResponse = await withRetry(
    async () => {
      const response = await fetchWithTimeout(
        buildTelegramFileUrl(env.telegramBotToken, getFileResult),
        {
          method: 'GET'
        },
        env.requestTimeoutMs
      );

      if (!response.ok) {
        const body = await response.text();
        throw createHttpError(`Telegram file download HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
          status: response.status,
          cause: truncateText(body)
        });
      }

      return response;
    },
    {
      maxAttempts: env.retryMaxAttempts
    }
  );

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > env.maxUploadBytes) {
    throw createHttpError(`Downloaded file exceeds MAX_UPLOAD_BYTES: ${buffer.length}`, {
      retryable: false
    });
  }

  logger.info('telegram_download_success', {
    file_id: fileId,
    bytes: buffer.length,
    cost_ms: Date.now() - startedAt
  });

  return {
    buffer,
    contentType: downloadResponse.headers.get('content-type') ?? undefined,
    filePath: getFileResult
  };
}
