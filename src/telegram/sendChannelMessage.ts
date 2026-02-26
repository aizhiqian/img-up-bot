import { AppEnv } from '../config/env';
import { Logger } from '../utils/logger';
import { createHttpError, fetchWithTimeout, readJsonSafe, truncateText, withRetry } from '../utils/http';

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
}

function buildTelegramApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

export async function sendChannelMessage(
  chatId: string,
  text: string,
  env: AppEnv,
  logger: Logger
): Promise<void> {
  const startedAt = Date.now();

  await withRetry(
    async () => {
      const response = await fetchWithTimeout(
        buildTelegramApiUrl(env.telegramBotToken, 'sendMessage'),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: false
          })
        },
        env.requestTimeoutMs
      );

      const raw = await response.text();
      const json = readJsonSafe(raw) as TelegramSendMessageResponse | null;

      if (!response.ok) {
        throw createHttpError(`Telegram sendMessage HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
          status: response.status,
          cause: truncateText(raw)
        });
      }

      if (!json || !json.ok) {
        throw createHttpError(`Telegram sendMessage invalid response: ${truncateText(raw)}`, {
          retryable: false
        });
      }
    },
    {
      maxAttempts: env.retryMaxAttempts
    }
  );

  logger.info('telegram_channel_reply_success', {
    chat_id: chatId,
    cost_ms: Date.now() - startedAt
  });
}
