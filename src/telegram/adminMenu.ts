import { AppEnv } from '../config/env';
import { RuntimeConfig, saveRuntimeConfig } from '../config/runtimeConfig';
import { Logger } from '../utils/logger';
import { answerCallbackQuery, sendBotMessage } from './botApi';

export type AdminUpdate =
  | {
      kind: 'command';
      chatId: string;
      userId: string;
      username?: string;
      text: string;
    }
  | {
      kind: 'text';
      chatId: string;
      userId: string;
      username?: string;
      text: string;
    }
  | {
      kind: 'callback';
      chatId: string;
      userId: string;
      username?: string;
      callbackQueryId: string;
      data: string;
    };

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

function parseMessage(update: RecordValue): AdminUpdate | null {
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

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  if (text.startsWith('/')) {
    return {
      kind: 'command',
      chatId,
      userId: from.userId,
      username: from.username,
      text
    };
  }

  return {
    kind: 'text',
    chatId,
    userId: from.userId,
    username: from.username,
    text
  };
}

function parseCallbackQuery(update: RecordValue): AdminUpdate | null {
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

  // callback_query.message.chat.id
  if (!isRecord(cq.message) || !isRecord(cq.message.chat) || (typeof cq.message.chat.id !== 'number' && typeof cq.message.chat.id !== 'string')) {
    return null;
  }

  if (typeof cq.data !== 'string') {
    return null;
  }

  return {
    kind: 'callback',
    chatId: String(cq.message.chat.id),
    userId: from.userId,
    username: from.username,
    callbackQueryId: cq.id,
    data: cq.data
  };
}

export function parseAdminUpdate(update: unknown): AdminUpdate | null {
  if (!isRecord(update)) {
    return null;
  }

  return parseCallbackQuery(update) ?? parseMessage(update);
}

export function isAdminUser(userId: string, env: AppEnv): boolean {
  return env.telegramAdminUserIds.has(userId);
}

type PendingField = 'uploadFolder' | 'uploadChannel' | 'uploadNameType';

function formatConfigSummary(cfg: RuntimeConfig): string {
  const imgbed = cfg.imgbed ?? {};
  const folder = imgbed.uploadFolder ?? '(未设置)';
  const channel = imgbed.uploadChannel ?? '(未设置)';
  const nameType = imgbed.uploadNameType ?? '(未设置)';

  return [
    '当前 ImgBed 运行时配置：',
    `- uploadFolder: ${folder}`,
    `- uploadChannel: ${channel}`,
    `- uploadNameType: ${nameType}`
  ].join('\n');
}

function buildMainMenu(cfg: RuntimeConfig): { text: string; replyMarkup: unknown } {
  return {
    text: formatConfigSummary(cfg),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '设置 uploadFolder', callback_data: 'imgbed:set:uploadFolder' },
          { text: '设置 uploadChannel', callback_data: 'imgbed:set:uploadChannel' }
        ],
        [{ text: '设置 uploadNameType', callback_data: 'imgbed:set:uploadNameType' }]
      ]
    }
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function handleAdminMenuUpdate(
  update: AdminUpdate,
  env: AppEnv,
  logger: Logger,
  runtimeConfig: RuntimeConfig,
  pendingByUserId: Map<string, PendingField>
): Promise<void> {
  if (!isAdminUser(update.userId, env)) {
    return;
  }

  if (update.kind === 'command') {
    if (update.text === '/config' || update.text === '/imgbed') {
      const menu = buildMainMenu(runtimeConfig);
      await sendBotMessage(update.chatId, menu.text, env, logger, { replyMarkup: menu.replyMarkup });
    }

    return;
  }

  if (update.kind === 'callback') {
    if (update.data.startsWith('imgbed:set:')) {
      const field = update.data.slice('imgbed:set:'.length) as PendingField;
      if (field === 'uploadFolder' || field === 'uploadChannel' || field === 'uploadNameType') {
        pendingByUserId.set(update.userId, field);
        await answerCallbackQuery(update.callbackQueryId, env, logger);
        await sendBotMessage(update.chatId, `请输入新的 ${field}（发送空文本可清空）：`, env, logger);
      }
    }

    return;
  }

  if (update.kind === 'text') {
    const pendingField = pendingByUserId.get(update.userId);
    if (!pendingField) {
      return;
    }

    pendingByUserId.delete(update.userId);

    const nextImgbed = {
      ...(runtimeConfig.imgbed ?? {}),
      [pendingField]: update.text
    } as RuntimeConfig['imgbed'];

    const nextConfig: RuntimeConfig = {
      ...runtimeConfig,
      version: 1,
      imgbed: nextImgbed,
      updatedAt: nowIso(),
      updatedBy: {
        userId: update.userId,
        username: update.username
      }
    };

    await saveRuntimeConfig(env.runtimeConfigPath, nextConfig, logger);

    const menu = buildMainMenu(nextConfig);
    await sendBotMessage(update.chatId, `已更新并保存。\n\n${menu.text}`, env, logger, { replyMarkup: menu.replyMarkup });
  }
}
