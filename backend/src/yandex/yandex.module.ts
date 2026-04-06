import { Module } from '@nestjs/common';
import { YandexFleetService } from './yandex-fleet.service';

@Module({
  providers: [YandexFleetService],
  exports: [YandexFleetService],
})
export class YandexModule {}
