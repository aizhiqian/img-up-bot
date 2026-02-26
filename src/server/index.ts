import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { AppEnv, loadEnv } from '../config/env';
import { createTelegramWebhookRouter, TelegramWebhookDependencies } from '../routes/telegramWebhook';
import { createDedupStore, DedupStore } from '../storage/dedupStore';
import { createLogger, Logger } from '../utils/logger';

export interface AppOptions {
  env?: AppEnv;
  logger?: Logger;
  dedupStore?: DedupStore;
  telegramWebhookDeps?: TelegramWebhookDependencies;
}

function createErrorResponse(error: unknown): { ok: false; error: string } {
  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message
    };
  }

  return {
    ok: false,
    error: 'Internal Server Error'
  };
}

export function createApp(options: AppOptions = {}): express.Express {
  const env = options.env ?? loadEnv();
  const logger = options.logger ?? createLogger(env.logLevel);
  const dedupStore = options.dedupStore ?? createDedupStore(env.dedupStoreType);

  const app = express();

  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '512kb'
    })
  );

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(createTelegramWebhookRouter(env, logger, dedupStore, options.telegramWebhookDeps));

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      ok: false,
      error: `Not Found: ${req.path}`
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('request_failed', {
      error
    });

    if (
      error instanceof SyntaxError &&
      'type' in error &&
      (error as SyntaxError & { type?: string }).type === 'entity.parse.failed'
    ) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid JSON payload'
      });
    }

    return res.status(500).json(createErrorResponse(error));
  });

  return app;
}

function startServer(): void {
  const env = loadEnv();
  const logger = createLogger(env.logLevel);
  const app = createApp({ env, logger });

  app.listen(env.port, () => {
    logger.info('server_started', {
      port: env.port,
      enable_channel_reply: env.enableChannelReply,
      dedup_store_type: env.dedupStoreType
    });
  });
}

if (require.main === module) {
  startServer();
}
