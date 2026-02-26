import 'dotenv/config';

type Command = 'set' | 'info';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function truncateText(text: string, maxLength = 500): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

async function telegramApi(botToken: string, method: string, body?: unknown): Promise<unknown> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body
      ? {
          'content-type': 'application/json'
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Telegram API returned non-JSON response (${response.status}): ${truncateText(text)}`);
  }

  if (!response.ok) {
    throw new Error(`Telegram API HTTP ${response.status}: ${truncateText(text)}`);
  }

  return json;
}

async function setWebhook(botToken: string, webhookUrl: string): Promise<void> {
  const result = await telegramApi(botToken, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['channel_post', 'edited_channel_post']
  });

  console.log(JSON.stringify(result, null, 2));
}

async function getWebhookInfo(botToken: string): Promise<void> {
  const result = await telegramApi(botToken, 'getWebhookInfo');
  console.log(JSON.stringify(result, null, 2));
}

function parseCommand(raw: string | undefined): Command {
  if (raw === 'set' || raw === 'info') {
    return raw;
  }

  throw new Error('Usage: tsx scripts/registerWebhook.ts <set|info>');
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN');

  if (command === 'set') {
    const webhookUrl = requireEnv('TELEGRAM_WEBHOOK_URL');
    await setWebhook(botToken, webhookUrl);
    return;
  }

  await getWebhookInfo(botToken);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exit(1);
});
