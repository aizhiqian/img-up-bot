import { AppEnv } from '../config/env';
import { Logger } from '../utils/logger';
import { UploadSettingsKey, UploadSettingsStore } from '../storage/uploadSettingsStore';
import { answerCallbackQuery, editBotMessageText, sendBotMessage } from './botApi';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object';
}

function parseFromUser(from: unknown): { userId: string; username?: string } | null {
  if (!isRecord(from)) {
    return null;
  }

  if (typeof from.id !== 'number' && typeof from.id !== 'string') {
    return null;
  }

  return {
    userId: String(from.id),
    username: typeof from.username === 'string' ? from.username : undefined
  };
}

function parseMessage(update: RecordValue):
  | {
      kind: 'message';
      chatId: string;
      chatType?: string;
      userId: string;
      username?: string;
      text: string;
    }
  | null {
  if (!isRecord(update.message)) {
    return null;
  }

  const message = update.message;

  if (!isRecord(message.chat) || (typeof message.chat.id !== 'number' && typeof message.chat.id !== 'string')) {
    return null;
  }

  const from = parseFromUser(message.from);
  if (!from) {
    return null;
  }

  if (typeof message.text !== 'string') {
    return null;
  }

  return {
    kind: 'message',
    chatId: String(message.chat.id),
    chatType: typeof message.chat.type === 'string' ? message.chat.type : undefined,
    userId: from.userId,
    username: from.username,
    text: message.text.trim()
  };
}

function parseCallbackQuery(update: RecordValue):
  | {
      kind: 'callback_query';
      chatId: string;
      chatType?: string;
      userId: string;
      username?: string;
      callbackQueryId: string;
      messageId?: number;
      data: string;
    }
  | null {
  if (!isRecord(update.callback_query)) {
    return null;
  }

  const cq = update.callback_query;
  if (typeof cq.id !== 'string') {
    return null;
  }

  const from = parseFromUser(cq.from);
  if (!from) {
    return null;
  }

  if (!isRecord(cq.message) || !isRecord(cq.message.chat) || (typeof cq.message.chat.id !== 'number' && typeof cq.message.chat.id !== 'string')) {
    return null;
  }

  if (typeof cq.data !== 'string') {
    return null;
  }

  const messageId = typeof cq.message.message_id === 'number' ? cq.message.message_id : undefined;

  return {
    kind: 'callback_query',
    chatId: String(cq.message.chat.id),
    chatType: typeof cq.message.chat.type === 'string' ? cq.message.chat.type : undefined,
    userId: from.userId,
    username: from.username,
    callbackQueryId: cq.id,
    messageId,
    data: cq.data
  };
}

type IncomingUpdate = ReturnType<typeof parseMessage> | ReturnType<typeof parseCallbackQuery>;

function parseIncomingUpdate(update: unknown): IncomingUpdate | null {
  if (!isRecord(update)) {
    return null;
  }

  return parseCallbackQuery(update) ?? parseMessage(update);
}

function isAdmin(env: AppEnv, userId: string): boolean {
  return env.telegramAdminUserIds.size > 0 && env.telegramAdminUserIds.has(userId);
}

type PendingState = {
  key: UploadSettingsKey;
  menuMessageId?: number;
};

type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

function formatValue(value: string | undefined): string {
  return value ? value : '(env)';
}

function buildMainPanel(overrides: { uploadNameType?: string; uploadChannel?: string; uploadFolder?: string }): {
  text: string;
  replyMarkup: InlineKeyboardMarkup;
} {
  const lines = [
    'ImgBed 上传参数（bot 覆盖值）：',
    `- uploadNameType: ${formatValue(overrides.uploadNameType)}`,
    `- uploadChannel: ${formatValue(overrides.uploadChannel)}`,
    `- uploadFolder: ${formatValue(overrides.uploadFolder)}`
  ];

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: 'uploadNameType', callback_data: 's:k:uploadNameType' }],
        [{ text: 'uploadChannel', callback_data: 's:k:uploadChannel' }],
        [{ text: 'uploadFolder', callback_data: 's:k:uploadFolder' }]
      ]
    }
  };
}

function buildKeyMenu(env: AppEnv, key: UploadSettingsKey, overrides: { [k in UploadSettingsKey]?: string }): {
  text: string;
  replyMarkup: InlineKeyboardMarkup;
} {
  const current = overrides[key];

  const rows: InlineKeyboardMarkup['inline_keyboard'] = [];

  if (key === 'uploadNameType') {
    rows.push([
      { text: 'default', callback_data: 's:v:uploadNameType:default' },
      { text: 'index', callback_data: 's:v:uploadNameType:index' }
    ]);
    rows.push([
      { text: 'origin', callback_data: 's:v:uploadNameType:origin' },
      { text: 'short', callback_data: 's:v:uploadNameType:short' }
    ]);
  }

  if (key === 'uploadChannel') {
    rows.push([
      { text: 'telegram', callback_data: 's:v:uploadChannel:telegram' },
      { text: 'cfr2', callback_data: 's:v:uploadChannel:cfr2' }
    ]);
    rows.push([
      { text: 's3', callback_data: 's:v:uploadChannel:s3' },
      { text: 'discord', callback_data: 's:v:uploadChannel:discord' }
    ]);
    rows.push([{ text: 'huggingface', callback_data: 's:v:uploadChannel:huggingface' }]);
  }

  if (key === 'uploadFolder') {
    const presets = env.telegramUploadFolderPresets.length > 0 ? env.telegramUploadFolderPresets : ['other'];

    for (let i = 0; i < presets.length; i += 2) {
      const left = presets[i];
      const right = presets[i + 1];
      const row: Array<{ text: string; callback_data: string }> = [];

      if (left) {
        row.push({ text: left, callback_data: `s:v:uploadFolder:${left}` });
      }
      if (right) {
        row.push({ text: right, callback_data: `s:v:uploadFolder:${right}` });
      }

      if (row.length > 0) {
        rows.push(row);
      }
    }

    rows.push([{ text: '自定义输入…', callback_data: 's:custom:uploadFolder' }]);
  }

  rows.push([{ text: '恢复默认(env)', callback_data: `s:clear:${key}` }]);
  rows.push([{ text: '返回', callback_data: 's:m' }]);

  return {
    text: [`设置 ${key}`, `当前：${formatValue(current)}`].join('\n'),
    replyMarkup: {
      inline_keyboard: rows
    }
  };
}

function assertUploadKey(value: string): value is UploadSettingsKey {
  return value === 'uploadNameType' || value === 'uploadChannel' || value === 'uploadFolder';
}

function validateCustomUploadFolder(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('..')) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    return null;
  }

  return trimmed;
}

export function applyUploadOverridesToPath(basePath: string, overrides: { [k in UploadSettingsKey]?: string }): string {
  const parsed = new URL(basePath, 'https://local.invalid');

  for (const key of ['uploadNameType', 'uploadChannel', 'uploadFolder'] as const) {
    const value = overrides[key];
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      parsed.searchParams.delete(key);
      continue;
    }

    parsed.searchParams.set(key, trimmed);
  }

  return `${parsed.pathname}${parsed.search}`;
}

export function createBotSettingsHandler(
  env: AppEnv,
  logger: Logger,
  settingsStore: UploadSettingsStore,
  deps: {
    sendMessageFn?: typeof sendBotMessage;
    answerCallbackQueryFn?: typeof answerCallbackQuery;
    editMessageTextFn?: typeof editBotMessageText;
  } = {}
): {
  handleUpdate(update: unknown): Promise<boolean>;
} {
  const sendMessageFn = deps.sendMessageFn ?? sendBotMessage;
  const answerCallbackQueryFn = deps.answerCallbackQueryFn ?? answerCallbackQuery;
  const editMessageTextFn = deps.editMessageTextFn ?? editBotMessageText;

  const pendingByUserId = new Map<string, PendingState>();

  async function editMessageText(chatId: string, messageId: number, text: string, replyMarkup: unknown): Promise<void> {
    await editMessageTextFn(chatId, messageId, text, env, logger, { replyMarkup });
  }

  async function showMainPanel(chatId: string, messageId: number | undefined): Promise<void> {
    const overrides = await settingsStore.getOverrides();
    const panel = buildMainPanel(overrides);

    if (messageId) {
      await editMessageText(chatId, messageId, panel.text, panel.replyMarkup);
    } else {
      await sendMessageFn(chatId, panel.text, env, logger, { replyMarkup: panel.replyMarkup });
    }
  }

  async function showKeyMenu(chatId: string, messageId: number | undefined, key: UploadSettingsKey): Promise<void> {
    const overrides = await settingsStore.getOverrides();
    const menu = buildKeyMenu(env, key, overrides);

    if (messageId) {
      await editMessageText(chatId, messageId, menu.text, menu.replyMarkup);
    } else {
      await sendMessageFn(chatId, menu.text, env, logger, { replyMarkup: menu.replyMarkup });
    }
  }

  async function handleMessage(u: Extract<IncomingUpdate, { kind: 'message' }>): Promise<boolean> {
    if (u.chatType !== 'private') {
      return false;
    }

    if (!isAdmin(env, u.userId)) {
      return false;
    }

    if (u.text === '/settings') {
      await showMainPanel(u.chatId, undefined);
      return true;
    }

    const pending = pendingByUserId.get(u.userId);
    if (!pending) {
      return false;
    }

    // 支持 /cancel
    if (u.text === '/cancel') {
      pendingByUserId.delete(u.userId);
      await sendMessageFn(u.chatId, '已取消。', env, logger);
      return true;
    }

    if (pending.key === 'uploadFolder') {
      const validated = validateCustomUploadFolder(u.text);
      if (!validated) {
        await sendMessageFn(u.chatId, 'uploadFolder 不合法：必须是相对路径，且不能包含 .. 或以 / 开头。可发送 /cancel 退出。', env, logger);
        return true;
      }

      await settingsStore.setKey('uploadFolder', validated);
      pendingByUserId.delete(u.userId);

      await showMainPanel(u.chatId, pending.menuMessageId);
      return true;
    }

    // 其他 key 暂不支持自定义输入（按设计仅 uploadFolder 支持）
    pendingByUserId.delete(u.userId);
    await sendMessageFn(u.chatId, '当前仅 uploadFolder 支持自定义输入。', env, logger);
    return true;
  }

  async function handleCallbackQuery(u: Extract<IncomingUpdate, { kind: 'callback_query' }>): Promise<boolean> {
    if (u.chatType !== 'private') {
      return false;
    }

    if (!isAdmin(env, u.userId)) {
      return false;
    }

    if (!u.data.startsWith('s:')) {
      return false;
    }

    await answerCallbackQueryFn(u.callbackQueryId, env, logger);

    const parts = u.data.split(':');
    const action = parts[1];

    if (action === 'm') {
      await showMainPanel(u.chatId, u.messageId);
      return true;
    }

    if (action === 'k') {
      const key = parts[2];
      if (typeof key === 'string' && assertUploadKey(key)) {
        await showKeyMenu(u.chatId, u.messageId, key);
        return true;
      }

      return true;
    }

    if (action === 'v') {
      const key = parts[2];
      const value = parts.slice(3).join(':');
      if (typeof key === 'string' && assertUploadKey(key) && value) {
        await settingsStore.setKey(key, value);
        await showMainPanel(u.chatId, u.messageId);
        return true;
      }

      return true;
    }

    if (action === 'custom') {
      const key = parts[2];
      if (key === 'uploadFolder') {
        pendingByUserId.set(u.userId, { key: 'uploadFolder', menuMessageId: u.messageId });
        await sendMessageFn(u.chatId, '请发送 uploadFolder（相对路径，例如 img/test）。可发送 /cancel 退出。', env, logger);
        return true;
      }

      return true;
    }

    if (action === 'clear') {
      const key = parts[2];
      if (typeof key === 'string' && assertUploadKey(key)) {
        await settingsStore.clearKey(key);
        await showMainPanel(u.chatId, u.messageId);
        return true;
      }

      return true;
    }

    return true;
  }

  return {
    async handleUpdate(update: unknown): Promise<boolean> {
      const incoming = parseIncomingUpdate(update);
      if (!incoming) {
        return false;
      }

      if (incoming.kind === 'message') {
        return await handleMessage(incoming);
      }

      if (incoming.kind === 'callback_query') {
        return await handleCallbackQuery(incoming);
      }

      return false;
    }
  };
}
