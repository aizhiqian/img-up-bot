import { describe, expect, it } from 'vitest';
import { parseUpdate } from '../src/telegram/parseUpdate';

describe('parseUpdate', () => {
  const allowedChatIds = new Set(['-100123']);

  it('接受 channel_post.photo', () => {
    const update = {
      update_id: 1,
      channel_post: {
        message_id: 42,
        chat: { id: -100123 },
        photo: [
          { file_id: 'small', file_unique_id: 'u1' },
          { file_id: 'large', file_unique_id: 'u2' }
        ]
      }
    };

    const parsed = parseUpdate(update, allowedChatIds);

    expect(parsed).toEqual({
      chatId: '-100123',
      messageId: 42,
      fileId: 'large',
      fileUniqueId: 'u2',
      isEdited: false
    });
  });

  it('接受 edited_channel_post.photo', () => {
    const update = {
      edited_channel_post: {
        message_id: 5,
        chat: { id: '-100123' },
        photo: [{ file_id: 'f1', file_unique_id: 'ux' }]
      }
    };

    const parsed = parseUpdate(update, allowedChatIds);

    expect(parsed?.isEdited).toBe(true);
    expect(parsed?.fileId).toBe('f1');
  });

  it('忽略非白名单频道', () => {
    const update = {
      channel_post: {
        message_id: 1,
        chat: { id: -100999 },
        photo: [{ file_id: 'f1' }]
      }
    };

    expect(parseUpdate(update, allowedChatIds)).toBeNull();
  });

  it('忽略没有 photo 的消息', () => {
    const update = {
      channel_post: {
        message_id: 1,
        chat: { id: -100123 },
        text: 'hello'
      }
    };

    expect(parseUpdate(update, allowedChatIds)).toBeNull();
  });

  it('忽略异常结构', () => {
    expect(parseUpdate(null, allowedChatIds)).toBeNull();
    expect(parseUpdate({ channel_post: {} }, allowedChatIds)).toBeNull();
    expect(parseUpdate({ channel_post: { message_id: 1, chat: { id: -100123 }, photo: [{}] } }, allowedChatIds)).toBeNull();
  });
});
