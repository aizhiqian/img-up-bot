import { NextFunction, Request, Response, Router } from 'express';
import { AppEnv } from '../config/env';
import { uploadImageToImgBed } from '../imgbed/uploadImage';
import { DedupStore } from '../storage/dedupStore';
import { downloadTelegramPhoto } from '../telegram/downloadFile';
import { parseUpdate } from '../telegram/parseUpdate';
import { sendChannelMessage } from '../telegram/sendChannelMessage';
import { Logger } from '../utils/logger';

export interface TelegramWebhookDependencies {
  downloadFn?: typeof downloadTelegramPhoto;
  uploadFn?: typeof uploadImageToImgBed;
  sendMessageFn?: typeof sendChannelMessage;
}

function messageKey(chatId: string, messageId: number): string {
  return `${chatId}:${messageId}`;
}

function renderReplyText(url: string, template?: string): string {
  if (!template) {
    return url;
  }

  if (template.includes('{url}')) {
    return template.replace(/\{url\}/g, url);
  }

  return `${template} ${url}`.trim();
}

function extractUpdateId(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const value = (payload as Record<string, unknown>).update_id;
  return typeof value === 'number' ? value : undefined;
}

export function createTelegramWebhookRouter(
  env: AppEnv,
  logger: Logger,
  dedupStore: DedupStore,
  dependencies: TelegramWebhookDependencies = {}
): Router {
  const router = Router();

  const downloadFn = dependencies.downloadFn ?? downloadTelegramPhoto;
  const uploadFn = dependencies.uploadFn ?? uploadImageToImgBed;
  const sendMessageFn = dependencies.sendMessageFn ?? sendChannelMessage;

  router.post('/telegram/webhook', async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const updateId = extractUpdateId(req.body);

    const parsed = parseUpdate(req.body, env.telegramAllowedChatIds);
    if (!parsed) {
      logger.debug('telegram_update_ignored', {
        update_id: updateId
      });

      return res.status(200).json({ ok: true, ignored: true });
    }

    const { chatId, messageId, fileId } = parsed;
    const dedupKey = messageKey(chatId, messageId);

    try {
      const existingByMessage = dedupStore.getMessageUploadUrl(dedupKey);
      if (existingByMessage) {
        logger.info('telegram_update_dedup_message_hit', {
          update_id: updateId,
          chat_id: chatId,
          message_id: messageId,
          file_id: fileId,
          uploaded_url: existingByMessage,
          cost_ms: Date.now() - startedAt
        });

        return res.status(200).json({ ok: true, dedup: true, url: existingByMessage });
      }

      let uploadedUrl = dedupStore.getFileUploadUrl(fileId);
      if (uploadedUrl) {
        logger.info('telegram_update_dedup_file_hit', {
          update_id: updateId,
          chat_id: chatId,
          message_id: messageId,
          file_id: fileId,
          uploaded_url: uploadedUrl
        });
      }

      if (!uploadedUrl) {
        const downloaded = await downloadFn(fileId, env, logger);
        uploadedUrl = await uploadFn(downloaded.buffer, downloaded.contentType, env, logger);
        dedupStore.setFileUploadUrl(fileId, uploadedUrl);
      }

      dedupStore.setMessageUploadUrl(dedupKey, uploadedUrl);

      if (env.enableChannelReply) {
        const replyText = renderReplyText(uploadedUrl, env.channelReplyTemplate);

        try {
          await sendMessageFn(chatId, replyText, env, logger);
        } catch (replyError) {
          logger.error('telegram_channel_reply_failed', {
            update_id: updateId,
            chat_id: chatId,
            message_id: messageId,
            file_id: fileId,
            uploaded_url: uploadedUrl,
            error: replyError
          });
        }
      }

      logger.info('telegram_update_processed', {
        update_id: updateId,
        chat_id: chatId,
        message_id: messageId,
        file_id: fileId,
        uploaded_url: uploadedUrl,
        cost_ms: Date.now() - startedAt
      });

      return res.status(200).json({ ok: true, url: uploadedUrl });
    } catch (error) {
      logger.error('telegram_update_failed', {
        update_id: updateId,
        chat_id: chatId,
        message_id: messageId,
        file_id: fileId,
        cost_ms: Date.now() - startedAt,
        error
      });

      return next(error);
    }
  });

  return router;
}
