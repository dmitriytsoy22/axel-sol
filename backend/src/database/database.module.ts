import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { DATABASE, openDatabase, type SqliteDatabase } from './database';

@Injectable()
class DatabaseCloser implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: SqliteDatabase) {}

  onApplicationShutdown(): void {
    this.db.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (config: AppConfig) => openDatabase(config.databasePath),
      inject: [APP_CONFIG],
    },
    DatabaseCloser,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
