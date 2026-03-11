import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { JsonFileUploadSettingsStore } from '../src/storage/uploadSettingsStore';
import { createLogger } from '../src/utils/logger';

describe('JsonFileUploadSettingsStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(process.cwd(), 'tmp-upload-settings-'));
  });

  it('文件不存在时返回空 overrides', async () => {
    const store = new JsonFileUploadSettingsStore(path.join(dir, 'missing.json'), createLogger('error'));
    await expect(store.getOverrides()).resolves.toEqual({});
  });

  it('setKey 会写入文件并可读回', async () => {
    const filePath = path.join(dir, 'settings.json');
    const store = new JsonFileUploadSettingsStore(filePath, createLogger('error'));

    await store.setKey('uploadFolder', 'img/test');

    await expect(store.getOverrides()).resolves.toEqual({ uploadFolder: 'img/test' });

    const raw = await fs.readFile(filePath, 'utf8');
    expect(raw).toContain('uploadFolder');
  });

  it('clearKey 会删除对应字段', async () => {
    const filePath = path.join(dir, 'settings.json');
    const store = new JsonFileUploadSettingsStore(filePath, createLogger('error'));

    await store.setKey('uploadFolder', 'img/test');
    await store.setKey('uploadChannel', 'discord');

    await store.clearKey('uploadFolder');

    await expect(store.getOverrides()).resolves.toEqual({ uploadChannel: 'discord' });
  });

  it('clearAll 会清空所有字段', async () => {
    const filePath = path.join(dir, 'settings.json');
    const store = new JsonFileUploadSettingsStore(filePath, createLogger('error'));

    await store.setKey('uploadFolder', 'img/test');

    await store.clearAll();

    await expect(store.getOverrides()).resolves.toEqual({});
  });

  it('值会自动 trim；空值 setKey 会报错', async () => {
    const filePath = path.join(dir, 'settings.json');
    const store = new JsonFileUploadSettingsStore(filePath, createLogger('error'));

    await store.setKey('uploadChannel', '  discord  ');
    await expect(store.getOverrides()).resolves.toEqual({ uploadChannel: 'discord' });

    await expect(store.setKey('uploadChannel', '   ')).rejects.toThrow(/empty/i);
  });

  it('文件内容非法 JSON 时降级为空（不抛错）', async () => {
    const filePath = path.join(dir, 'bad.json');
    await fs.writeFile(filePath, '{not json}', 'utf8');

    const store = new JsonFileUploadSettingsStore(filePath, createLogger('error'));
    await expect(store.getOverrides()).resolves.toEqual({});
  });
});
