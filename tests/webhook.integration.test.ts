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

function validUpdate(messageId: number): Record<string, unknown> {
  return {
    update_id: 1000 + messageId,
    channel_post: {
      message_id: messageId,
      chat: { id: -100123 },
      photo: [{ file_id: `file-${messageId}`, file_unique_id: `u-${messageId}` }]
    }
  };
}

describe('telegram webhook integration', () => {
  it('完整链路：webhook -> 下载 -> 上传 -> 回写', async () => {
    const env = makeEnv();
    const dedup = createDedupStore('memory');

    const downloadFn = vi.fn().mockResolvedValue({
      buffer: Buffer.from('img-bytes'),
      contentType: 'image/jpeg'
    });
    const uploadFn = vi.fn().mockResolvedValue('https://imgbed.example/img/a.jpg');
    const sendMessageFn = vi.fn().mockResolvedValue(undefined);

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: dedup,
      telegramWebhookDeps: {
        downloadFn,
        uploadFn,
        sendMessageFn
      }
    });

    const response = await request(app).post('/telegram/webhook').send(validUpdate(1));

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.url).toBe('https://imgbed.example/img/a.jpg');
    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(sendMessageFn).toHaveBeenCalledTimes(1);
  });

  it('重复 message_id 命中去重，不二次上传', async () => {
    const env = makeEnv();
    const dedup = createDedupStore('memory');

    const downloadFn = vi.fn().mockResolvedValue({
      buffer: Buffer.from('img-bytes'),
      contentType: 'image/jpeg'
    });
    const uploadFn = vi.fn().mockResolvedValue('https://imgbed.example/img/a.jpg');
    const sendMessageFn = vi.fn().mockResolvedValue(undefined);

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: dedup,
      telegramWebhookDeps: {
        downloadFn,
        uploadFn,
        sendMessageFn
      }
    });

    const body = validUpdate(2);

    const first = await request(app).post('/telegram/webhook').send(body);
    const second = await request(app).post('/telegram/webhook').send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.dedup).toBe(true);
    expect(downloadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn).toHaveBeenCalledTimes(1);
  });

  it('非白名单频道被忽略', async () => {
    const env = makeEnv();

    const downloadFn = vi.fn();
    const uploadFn = vi.fn();

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: createDedupStore('memory'),
      telegramWebhookDeps: {
        downloadFn,
        uploadFn,
        sendMessageFn: vi.fn()
      }
    });

    const response = await request(app)
      .post('/telegram/webhook')
      .send({
        update_id: 1,
        channel_post: {
          message_id: 1,
          chat: { id: -100999 },
          photo: [{ file_id: 'f1' }]
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.ignored).toBe(true);
    expect(downloadFn).not.toHaveBeenCalled();
    expect(uploadFn).not.toHaveBeenCalled();
  });

  it('上传失败时返回 500', async () => {
    const env = makeEnv();

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: createDedupStore('memory'),
      telegramWebhookDeps: {
        downloadFn: vi.fn().mockResolvedValue({
          buffer: Buffer.from('img-bytes'),
          contentType: 'image/jpeg'
        }),
        uploadFn: vi.fn().mockRejectedValue(new Error('upload failed')),
        sendMessageFn: vi.fn()
      }
    });

    const response = await request(app).post('/telegram/webhook').send(validUpdate(3));

    expect(response.status).toBe(500);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('upload failed');
  });

  it('回写失败不回滚成功上传', async () => {
    const env = makeEnv();

    const uploadFn = vi.fn().mockResolvedValue('https://imgbed.example/img/a.jpg');

    const app = createApp({
      env,
      logger: createLogger('error'),
      dedupStore: createDedupStore('memory'),
      telegramWebhookDeps: {
        downloadFn: vi.fn().mockResolvedValue({
          buffer: Buffer.from('img-bytes'),
          contentType: 'image/jpeg'
        }),
        uploadFn,
        sendMessageFn: vi.fn().mockRejectedValue(new Error('send failed'))
      }
    });

    const response = await request(app).post('/telegram/webhook').send(validUpdate(4));

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.url).toBe('https://imgbed.example/img/a.jpg');
    expect(uploadFn).toHaveBeenCalledTimes(1);
  });
});
