export interface DedupStore {
  getMessageUploadUrl(messageKey: string): string | undefined;
  setMessageUploadUrl(messageKey: string, uploadedUrl: string): void;
  getFileUploadUrl(fileId: string): string | undefined;
  setFileUploadUrl(fileId: string, uploadedUrl: string): void;
}

class MemoryDedupStore implements DedupStore {
  private readonly messageToUrl = new Map<string, string>();

  private readonly fileIdToUrl = new Map<string, string>();

  getMessageUploadUrl(messageKey: string): string | undefined {
    return this.messageToUrl.get(messageKey);
  }

  setMessageUploadUrl(messageKey: string, uploadedUrl: string): void {
    this.messageToUrl.set(messageKey, uploadedUrl);
  }

  getFileUploadUrl(fileId: string): string | undefined {
    return this.fileIdToUrl.get(fileId);
  }

  setFileUploadUrl(fileId: string, uploadedUrl: string): void {
    this.fileIdToUrl.set(fileId, uploadedUrl);
  }
}

export function createDedupStore(storeType: 'memory' | 'redis'): DedupStore {
  if (storeType === 'memory') {
    return new MemoryDedupStore();
  }

  throw new Error('DEDUP_STORE_TYPE=redis 尚未实现，请先使用 memory');
}
