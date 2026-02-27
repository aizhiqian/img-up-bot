export interface ParsedPhotoUpdate {
  chatId: string;
  messageId: number;
  fileId: string;
  fileUniqueId: string;
  isEdited: boolean;
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object';
}

function pickChannelPost(update: RecordValue): { post: RecordValue; isEdited: boolean } | null {
  if (isRecord(update.channel_post)) {
    return {
      post: update.channel_post,
      isEdited: false
    };
  }

  if (isRecord(update.edited_channel_post)) {
    return {
      post: update.edited_channel_post,
      isEdited: true
    };
  }

  return null;
}

function pickFileFromPhoto(post: RecordValue): { fileId: string; fileUniqueId: string } | null {
  if (!Array.isArray(post.photo) || post.photo.length === 0) {
    return null;
  }

  const largest = post.photo[post.photo.length - 1];
  if (!isRecord(largest) || typeof largest.file_id !== 'string') {
    return null;
  }

  return {
    fileId: largest.file_id,
    fileUniqueId: typeof largest.file_unique_id === 'string' ? largest.file_unique_id : ''
  };
}

function pickFileFromImageDocument(post: RecordValue): { fileId: string; fileUniqueId: string } | null {
  if (!isRecord(post.document)) {
    return null;
  }

  const document = post.document;
  if (typeof document.file_id !== 'string') {
    return null;
  }

  if (typeof document.mime_type !== 'string' || !document.mime_type.toLowerCase().startsWith('image/')) {
    return null;
  }

  return {
    fileId: document.file_id,
    fileUniqueId: typeof document.file_unique_id === 'string' ? document.file_unique_id : ''
  };
}

export function parseUpdate(update: unknown, allowedChatIds: Set<string>): ParsedPhotoUpdate | null {
  if (!isRecord(update)) {
    return null;
  }

  const channelPayload = pickChannelPost(update);
  if (!channelPayload) {
    return null;
  }

  const { post, isEdited } = channelPayload;

  if (typeof post.message_id !== 'number') {
    return null;
  }

  if (!isRecord(post.chat) || (typeof post.chat.id !== 'number' && typeof post.chat.id !== 'string')) {
    return null;
  }

  const chatId = String(post.chat.id);
  if (!allowedChatIds.has(chatId)) {
    return null;
  }

  const picked = pickFileFromPhoto(post) ?? pickFileFromImageDocument(post);
  if (!picked) {
    return null;
  }

  return {
    chatId,
    messageId: post.message_id,
    fileId: picked.fileId,
    fileUniqueId: picked.fileUniqueId,
    isEdited
  };
}
