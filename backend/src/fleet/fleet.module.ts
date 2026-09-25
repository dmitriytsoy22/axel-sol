import { Module } from '@nestjs/common';

import { FLEET_HTTP_FETCH, type FleetFetch, YandexFleetClient } from './yandex-fleet.client';

const globalFetch: FleetFetch = (input, init) => fetch(input, init);

@Module({
  providers: [YandexFleetClient, { provide: FLEET_HTTP_FETCH, useValue: globalFetch }],
  exports: [YandexFleetClient],
})
export class FleetModule {}
