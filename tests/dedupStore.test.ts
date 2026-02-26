import { describe, expect, it } from 'vitest';
import { createDedupStore } from '../src/storage/dedupStore';

describe('dedupStore', () => {
  it('按 message key 去重', () => {
    const store = createDedupStore('memory');

    expect(store.getMessageUploadUrl('-100:1')).toBeUndefined();

    store.setMessageUploadUrl('-100:1', 'https://img.example/a.jpg');

    expect(store.getMessageUploadUrl('-100:1')).toBe('https://img.example/a.jpg');
  });

  it('维护 file_id 到 url 映射', () => {
    const store = createDedupStore('memory');

    expect(store.getFileUploadUrl('file-1')).toBeUndefined();

    store.setFileUploadUrl('file-1', 'https://img.example/x.jpg');

    expect(store.getFileUploadUrl('file-1')).toBe('https://img.example/x.jpg');
  });

  it('redis 类型尚未实现时抛错', () => {
    expect(() => createDedupStore('redis')).toThrow(/尚未实现/);
  });
});
