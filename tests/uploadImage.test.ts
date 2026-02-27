import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppEnv } from '../src/config/env';
import * as uploadImageModule from '../src/imgbed/uploadImage';
import { createLogger } from '../src/utils/logger';

const baseEnv: AppEnv = {
  nodeEnv: 'test',
  port: 0,
  telegramBotToken: 'bot-token',
  telegramWebhookUrl: 'https://example.com/telegram/webhook',
  telegramAllowedChatIds: new Set(['-100123']),
  imgbedBaseUrl: 'https://imgbed.example',
  imgbedUploadToken: 'upload-token',
  imgbedUploadPath: '/upload',
  requestTimeoutMs: 50,
  retryMaxAttempts: 2,
  maxUploadBytes: 1024 * 1024,
  logLevel: 'error',
  enableChannelReply: true,
  channelReplyTemplate: undefined,
  dedupStoreType: 'memory'
};

describe('uploadImageModule.uploadImageToImgBed', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('上传文件名使用 yyyyMMdd_HHmmss 格式', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 5, 2, 4, 9));

    const appendSpy = vi.spyOn(FormData.prototype, 'append');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ src: '/images/a.jpg' }] }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    await uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), 'image/jpeg', baseEnv, createLogger('error'));

    const fileAppendCall = appendSpy.mock.calls.find((call) => call[0] === 'file');
    expect(fileAppendCall?.[2]).toBe('20260205_020409.jpg');

    vi.useRealTimers();
  });

  it('解析 data[0].src 并拼接完整 URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ src: '/images/a.jpg' }] }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), 'image/jpeg', baseEnv, createLogger('error'));

    expect(url).toBe('https://imgbed.example/images/a.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('保留绝对 URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ src: 'https://cdn.example/file.jpg' }] }), {
        status: 200
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), undefined, baseEnv, createLogger('error'));

    expect(url).toBe('https://cdn.example/file.jpg');
  });

  it('401 时抛出明确错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'unauthorized' }), {
        status: 401
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), undefined, baseEnv, createLogger('error'))).rejects.toThrow(
      /ImgBed upload HTTP 401/
    );
  });

  it('5xx 时按重试后恢复成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'server error' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ src: '/ok.jpg' }] }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), undefined, baseEnv, createLogger('error'));

    expect(url).toBe('https://imgbed.example/ok.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('数组根响应可解析 src', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ src: '/file/abc.jpg' }]), {
        status: 200
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const url = await uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), undefined, baseEnv, createLogger('error'));

    expect(url).toBe('https://imgbed.example/file/abc.jpg');
  });

  it('空响应体时抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadImageModule.uploadImageToImgBed(Buffer.from('abc'), undefined, baseEnv, createLogger('error'))).rejects.toThrow(
      /invalid response/
    );
  });
});
