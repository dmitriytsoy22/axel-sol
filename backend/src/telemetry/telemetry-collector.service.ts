import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type Clock } from '../common/clock';
import { addDays, eachDay, localDate } from '../common/dates';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { FleetCar } from '../fleet/fleet-config';
import { simulateDay } from '../fleet/simulated-fleet';
import { YandexFleetClient } from '../fleet/yandex-fleet.client';
import { type DayFigures, publishDay } from './day-record';
import { TelemetryStore } from './telemetry.store';

/**
 * How far back a run fills in missed days. A day older than this is never collected, which
 * leaves a gap that revenue reports cannot span.
 */
export const MAX_BACKFILL_DAYS = 31;

export interface CollectResult {
  mint: string;
  collected: string[];
  /** The day that could not be read; later days wait for the next run so none is skipped. */
  failedAt: string | null;
}

/** Reads every finished day each car is missing, oldest first, and stores it as published. */
@Injectable()
export class TelemetryCollector {
  private readonly logger = new Logger(TelemetryCollector.name);
  private readonly cars: FleetCar[];
  private readonly utcOffsetMinutes: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly store: TelemetryStore,
    private readonly yandex: YandexFleetClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.cars = config.fleet.cars;
    this.utcOffsetMinutes = config.fleet.utcOffsetMinutes;
  }

  async collectAll(): Promise<CollectResult[]> {
    const yesterday = addDays(localDate(this.clock.now(), this.utcOffsetMinutes), -1);
    const runs = this.cars.map((car) => {
      const result: CollectResult = { mint: car.mintAddress, collected: [], failedAt: null };
      return { car, due: this.dueDays(car, yesterday), result };
    });

    for (const { car, due, result } of runs) {
      if (car.source === 'simulated') {
        for (const date of due) {
          this.save(car, date, simulateDay(car, date), result);
        }
      }
    }

    const yandexRuns = runs.flatMap(({ car, due, result }) =>
      car.source === 'yandex_fleet' ? [{ car, due, result }] : [],
    );
    const dates = [...new Set(yandexRuns.flatMap((run) => run.due))].sort();
    for (const date of dates) {
      // Once a day fails for a car, its later days wait for the next run, so none is skipped.
      const reading = yandexRuns.filter(
        (run) => run.result.failedAt === null && run.due.includes(date),
      );
      if (reading.length === 0) {
        continue;
      }
      let figures: DayFigures[];
      try {
        figures = await this.yandex.readDay(
          date,
          reading.map((run) => run.car),
        );
      } catch (err) {
        this.logger.error(
          `Yandex Fleet read for ${date} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        for (const run of reading) {
          run.result.failedAt = date;
        }
        continue;
      }
      reading.forEach((run, index) => this.save(run.car, date, figures[index], run.result));
    }
    return runs.map((run) => run.result);
  }

  /** Days from the one after the last collected (or the start date) to yesterday. */
  private dueDays(car: FleetCar, yesterday: string): string[] {
    const last = this.store.lastCollectedDate(car.mintAddress);
    const first = last !== null ? addDays(last, 1) : (car.startDate ?? yesterday);
    const earliest = addDays(yesterday, -(MAX_BACKFILL_DAYS - 1));
    return eachDay(first > earliest ? first : earliest, yesterday);
  }

  /** Stores the day; a reading that cannot be published stops the car, not the whole run. */
  private save(car: FleetCar, date: string, figures: DayFigures, result: CollectResult): void {
    if (result.failedAt !== null) {
      return;
    }
    try {
      const day = publishDay(car.mintAddress, date, this.utcOffsetMinutes, figures, car.source);
      this.store.saveDay(day, figures, this.clock.now());
      result.collected.push(date);
    } catch (err) {
      this.logger.error(
        `${car.mintAddress}: ${date} not published: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.failedAt = date;
    }
  }
}
