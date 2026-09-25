import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { CLOCK, type Clock } from '../common/clock';
import { addDays, isIsoDate, localDate } from '../common/dates';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { DataOrigin, FleetCar } from '../fleet/fleet-config';
import { ProgramAccounts } from '../solana/program-accounts';
import type { DayRecord, VehicleStatus } from './day-record';
import { type StoredDay, TelemetryStore } from './telemetry.store';

export const HEAD_FORMULA = 'sha256(headBefore || u32le(YYYYMMDD) || dataHash)';
const MAX_CHAIN_ENTRIES = 366;

/** The asset page widget's contract, kept from the first backend. */
interface LatestTelemetryResponse {
  date: string;
  /** Rent the park charged for the car that day, KZT. */
  dailyRevenue: number;
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive' | '';
  dataHash: string;
  /** The `record_telemetry` transaction, once confirmed. */
  solanaTxSignature: string | null;
  stale: boolean;
  available: boolean;
  dataOrigin: DataOrigin | null;
}

interface ChainLinkResponse {
  position: number;
  headBefore: string;
  headAfter: string;
  txSignature: string;
  confirmedAt: string;
}

interface DayProofResponse {
  mint: string;
  project: string;
  date: string;
  dataOrigin: DataOrigin;
  /** The published text; its SHA-256 is `dataHash`. */
  raw: string;
  record: DayRecord;
  rawUrl: string;
  dataHash: string;
  /** `null` until the day's batch is confirmed on-chain. */
  chain: ChainLinkResponse | null;
  headFormula: string;
}

interface ChainEntryResponse {
  date: string;
  dataHash: string;
  dataOrigin: DataOrigin;
  position: number;
  headAfter: string;
  txSignature: string;
}

interface ChainResponse {
  mint: string;
  project: string;
  entries: ChainEntryResponse[];
  /** More confirmed days exist in the range than one response lists. */
  truncated: boolean;
  headFormula: string;
}

const LEGACY_STATUS: Record<VehicleStatus, LatestTelemetryResponse['carStatus']> = {
  active: 'active',
  idle: 'inactive',
  maintenance: 'maintenance',
};

function confirmedLink(day: StoredDay): ChainLinkResponse | null {
  if (day.chain === null || day.chain.confirmedAt === null) {
    return null;
  }
  return {
    position: day.chain.position,
    headBefore: day.chain.headBefore,
    headAfter: day.chain.headAfter,
    txSignature: day.chain.txSignature,
    confirmedAt: new Date(day.chain.confirmedAt).toISOString(),
  };
}

function requireDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !isIsoDate(value)) {
    throw new BadRequestException(`${name} must be a day as YYYY-MM-DD`);
  }
  return value;
}

/** Published daily telemetry: the exact hashed text, its place in the chain, and the chain. */
@Controller('telemetry')
export class TelemetryController {
  private readonly cars: Map<string, FleetCar>;
  private readonly utcOffsetMinutes: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly store: TelemetryStore,
    private readonly accounts: ProgramAccounts,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.cars = new Map(config.fleet.cars.map((car) => [car.mintAddress, car]));
    this.utcOffsetMinutes = config.fleet.utcOffsetMinutes;
  }

  /** The newest collected day of a car, in the shape the asset page widget reads. */
  @Get('latest/:mint')
  latest(@Param('mint') mint: string): LatestTelemetryResponse {
    const day = this.cars.has(mint) ? this.store.latestDay(mint) : null;
    if (day === null) {
      return {
        date: '',
        dailyRevenue: 0,
        mileageKm: 0,
        tripsCount: 0,
        carStatus: '',
        dataHash: '',
        solanaTxSignature: null,
        stale: false,
        available: false,
        dataOrigin: null,
      };
    }
    const today = localDate(this.clock.now(), this.utcOffsetMinutes);
    return {
      date: day.date,
      dailyRevenue: day.figures.rentCharged,
      mileageKm: day.figures.km,
      tripsCount: day.figures.trips,
      carStatus: LEGACY_STATUS[day.figures.status],
      dataHash: day.dataHash,
      solanaTxSignature: confirmedLink(day)?.txSignature ?? null,
      stale: day.date !== today && day.date !== addDays(today, -1),
      available: true,
      dataOrigin: day.dataOrigin,
    };
  }

  /** A day's published record with its hash and its position in the on-chain chain. */
  @Get(':mint/proof')
  proof(@Param('mint') mint: string, @Query('date') date: unknown): DayProofResponse {
    const car = this.requireCar(mint);
    const day = this.requireDay(car, requireDate(date, 'date'));
    return {
      mint,
      project: this.accounts.projectAddress(car.mint).toBase58(),
      date: day.date,
      dataOrigin: day.dataOrigin,
      raw: day.canonical,
      record: JSON.parse(day.canonical) as DayRecord,
      rawUrl: `/telemetry/${mint}/${day.date}.json`,
      dataHash: day.dataHash,
      chain: confirmedLink(day),
      headFormula: HEAD_FORMULA,
    };
  }

  /** Confirmed chain entries between `from` and `to`, in chain order, to recompute the head. */
  @Get(':mint/chain')
  chain(
    @Param('mint') mint: string,
    @Query('from') from: unknown,
    @Query('to') to: unknown,
  ): ChainResponse {
    const car = this.requireCar(mint);
    const start = from === undefined ? '2000-01-01' : requireDate(from, 'from');
    const end = to === undefined ? '9999-12-31' : requireDate(to, 'to');
    const days = this.store.confirmedBetween(mint, start, end, MAX_CHAIN_ENTRIES + 1);
    const entries = days.slice(0, MAX_CHAIN_ENTRIES).flatMap((day) => {
      const link = confirmedLink(day);
      return link === null
        ? []
        : [
            {
              date: day.date,
              dataHash: day.dataHash,
              dataOrigin: day.dataOrigin,
              position: link.position,
              headAfter: link.headAfter,
              txSignature: link.txSignature,
            },
          ];
    });
    return {
      mint,
      project: this.accounts.projectAddress(car.mint).toBase58(),
      entries,
      truncated: days.length > MAX_CHAIN_ENTRIES,
      headFormula: HEAD_FORMULA,
    };
  }

  /** The exact published text of a day; its SHA-256 is the `data_hash` in the chain. */
  @Get(':mint/:date.json')
  @Header('Content-Type', 'application/json; charset=utf-8')
  // A collected day's text never changes: its hash may already be on-chain.
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  raw(@Param('mint') mint: string, @Param('date') date: string): string {
    return this.requireDay(this.requireCar(mint), requireDate(date, 'date')).canonical;
  }

  private requireCar(mint: string): FleetCar {
    const car = this.cars.get(mint);
    if (car === undefined) {
      throw new NotFoundException(`${mint} is not a car of this fleet`);
    }
    return car;
  }

  private requireDay(car: FleetCar, date: string): StoredDay {
    const day = this.store.day(car.mintAddress, date);
    if (day === null) {
      throw new NotFoundException(`No telemetry for ${car.mintAddress} on ${date}`);
    }
    return day;
  }
}
