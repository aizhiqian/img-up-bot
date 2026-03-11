import { describe, expect, it } from 'vitest';
import { mergeImgbedUploadPath } from '../src/config/runtimeConfig';

describe('runtimeConfig.mergeImgbedUploadPath', () => {
  it('覆盖既有 query 参数', () => {
    expect(mergeImgbedUploadPath('/upload?uploadFolder=other&uploadChannel=discord', { uploadFolder: 'cats' })).toBe(
      '/upload?uploadFolder=cats&uploadChannel=discord'
    );
  });

  it('当 overrides 为空时保持原样', () => {
    expect(mergeImgbedUploadPath('/upload?uploadFolder=other', undefined)).toBe('/upload?uploadFolder=other');
  });

  it('当 envUploadPath 无 query 时正确追加', () => {
    expect(mergeImgbedUploadPath('/upload', { uploadNameType: 'short' })).toBe('/upload?uploadNameType=short');
  });

  it('空字符串会删除对应 key', () => {
    expect(mergeImgbedUploadPath('/upload?uploadFolder=other&uploadChannel=discord', { uploadFolder: '  ' })).toBe(
      '/upload?uploadChannel=discord'
    );
  });
});
