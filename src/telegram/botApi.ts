import { AppEnv } from '../config/env';
import { Logger } from '../utils/logger';
import { createHttpError, fetchWithTimeout, readJsonSafe, truncateText, withRetry } from '../utils/http';

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

function buildTelegramApiUrl(botToken: string, method: string): string {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

export async function sendBotMessage(
  chatId: string,
  text: string,
  env: AppEnv,
  logger: Logger,
  options: {
    replyMarkup?: unknown;
    disableWebPagePreview?: boolean;
  } = {}
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
            disable_web_page_preview: options.disableWebPagePreview ?? true,
            reply_markup: options.replyMarkup
          })
        },
        env.requestTimeoutMs
      );

      const raw = await response.text();
      const json = readJsonSafe(raw) as TelegramApiResponse | null;

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

  logger.info('telegram_bot_send_message_success', {
    chat_id: chatId,
    cost_ms: Date.now() - startedAt
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  env: AppEnv,
  logger: Logger,
  options: {
    text?: string;
    showAlert?: boolean;
  } = {}
): Promise<void> {
  const startedAt = Date.now();

  await withRetry(
    async () => {
      const response = await fetchWithTimeout(
        buildTelegramApiUrl(env.telegramBotToken, 'answerCallbackQuery'),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text: options.text,
            show_alert: options.showAlert
          })
        },
        env.requestTimeoutMs
      );

      const raw = await response.text();
      const json = readJsonSafe(raw) as TelegramApiResponse | null;

      if (!response.ok) {
        throw createHttpError(`Telegram answerCallbackQuery HTTP ${response.status}`, {
          retryable: response.status >= 500 || response.status === 429,
          status: response.status,
          cause: truncateText(raw)
        });
      }

      if (!json || !json.ok) {
        throw createHttpError(`Telegram answerCallbackQuery invalid response: ${truncateText(raw)}`, {
          retryable: false
        });
      }
    },
    {
      maxAttempts: env.retryMaxAttempts
    }
  );

  logger.info('telegram_bot_answer_callback_query_success', {
    cost_ms: Date.now() - startedAt
  });
}
