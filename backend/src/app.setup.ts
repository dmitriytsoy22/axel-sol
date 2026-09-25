import type { NestExpressApplication } from '@nestjs/platform-express';

import type { AppConfig } from './config/app-config';

/** HTTP settings shared by `main.ts` and the tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.enableCors({ origin: config.corsOrigins, methods: ['GET', 'POST'] });
  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }
}
