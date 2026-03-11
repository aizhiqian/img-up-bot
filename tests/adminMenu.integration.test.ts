import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AppEnv } from '../src/config/env';
import { createApp } from '../src/server/index';
import { createDedupStore } from '../src/storage/dedupStore';
import { createLogger } from '../src/utils/logger';

function makeEnv(): AppEnv {
  return {
    nodeEnv: 'test',
    port: 0,
    telegramBotToken: 'bot-token',
    telegramWebhookUrl: 'https://example.com/telegram/webhook',
    telegramAllowedChatIds: new Set(['-100123']),

    telegramAdminUserIds: new Set(['42']),
    telegramUploadFolderPresets: ['other'],

    botSettingsFilePath: 'data/test-bot-settings.json',

    imgbedBaseUrl: 'https://imgbed.example',
    imgbedUploadToken: 'upload-token',
    imgbedUploadPath: '/upload',

    requestTimeoutMs: 100,
    retryMaxAttempts: 2,
    maxUploadBytes: 1024 * 1024,
    logLevel: 'error',

    enableChannelReply: true,
    channelReplyTemplate: undefined,
    dedupStoreType: 'memory'
  };
}

function adminCommandUpdate(text: string): Record<string, unknown> {
  return {
    update_id: 9001,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 42, type: 'private' },
      from: { id: 42, is_bot: false, username: 'admin' },
      text
    }
  };
}

describe('admin menu integration', () => {
  it('非管理员 /settings 不触发菜单处理', async () => {
    const env = makeEnv();
    env.telegramAdminUserIds = new Set(['999']);

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: createDedupStore('memory'),
      telegramWebhookDeps: {
        downloadFn: vi.fn(),
        uploadFn: vi.fn(),
        sendMessageFn: vi.fn(),
        botSettingsDeps: {
          sendMessageFn: vi.fn().mockResolvedValue(undefined),
          answerCallbackQueryFn: vi.fn().mockResolvedValue(undefined),
          editMessageTextFn: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    const response = await request(app).post('/telegram/webhook').send(adminCommandUpdate('/settings'));

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.ignored).toBe(true);
  });

  it('管理员 /settings 触发菜单处理（不会走图片链路）', async () => {
    const env = makeEnv();

    const downloadFn = vi.fn();
    const uploadFn = vi.fn();
    const sendMessageFn = vi.fn();

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: createDedupStore('memory'),
      telegramWebhookDeps: {
        downloadFn,
        uploadFn,
        sendMessageFn,
        botSettingsDeps: {
          sendMessageFn: vi.fn().mockResolvedValue(undefined),
          answerCallbackQueryFn: vi.fn().mockResolvedValue(undefined),
          editMessageTextFn: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    const response = await request(app).post('/telegram/webhook').send(adminCommandUpdate('/settings'));

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.settings).toBe(true);

    expect(downloadFn).not.toHaveBeenCalled();
    expect(uploadFn).not.toHaveBeenCalled();
    expect(sendMessageFn).not.toHaveBeenCalled();
  });
});
