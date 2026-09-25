import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, loadAppConfig } from './app-config';

/**
 * Provides the validated configuration. The factory runs when the application is created,
 * after `ConfigModule.forRoot` in `AppModule` has loaded `.env` into `process.env`.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadAppConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
