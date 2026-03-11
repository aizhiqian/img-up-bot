import { describe, expect, it } from 'vitest';
import { applyUploadOverridesToPath } from '../src/telegram/botSettings';

describe('applyUploadOverridesToPath', () => {
  it('覆盖既有 query 参数', () => {
    expect(applyUploadOverridesToPath('/upload?uploadFolder=other&uploadChannel=discord', { uploadFolder: 'cats' })).toBe(
      '/upload?uploadFolder=cats&uploadChannel=discord'
    );
  });

  it('当 overrides 为空时保持原样', () => {
    expect(applyUploadOverridesToPath('/upload?uploadFolder=other', {})).toBe('/upload?uploadFolder=other');
  });

  it('当 basePath 无 query 时正确追加', () => {
    expect(applyUploadOverridesToPath('/upload', { uploadNameType: 'short' })).toBe('/upload?uploadNameType=short');
  });

  it('空字符串会删除对应 key', () => {
    expect(applyUploadOverridesToPath('/upload?uploadFolder=other&uploadChannel=discord', { uploadFolder: '  ' })).toBe(
      '/upload?uploadChannel=discord'
    );
  });
});
