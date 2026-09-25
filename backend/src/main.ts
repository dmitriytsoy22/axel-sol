import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { APP_CONFIG, type AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  // The raw body is kept so the Sumsub webhook HMAC is checked over the exact bytes sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log(`Backend listening on port ${config.port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err), 'Bootstrap');
  process.exit(1);
});
