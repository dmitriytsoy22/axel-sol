import { Inject, Injectable, Logger } from '@nestjs/common';
import { Keypair, TransactionExpiredBlockheightExceededError } from '@solana/web3.js';

import { CLOCK, type Clock } from '../common/clock';
import { dateNumber, isoFromDateNumber } from '../common/dates';
import { KeyedSerialQueue } from '../common/keyed-serial-queue';
import type { FleetCar } from '../fleet/fleet-config';
import { type ProjectAccount, ProgramAccounts } from '../solana/program-accounts';
import { SolanaService, TransactionFailedError } from '../solana/solana.service';
import { nextHead, VEHICLE_STATUS_CODES } from './day-record';
import { type PlannedLink, type StoredDay, TelemetryStore } from './telemetry.store';

export const ORACLE_KEYPAIR = Symbol('ORACLE_KEYPAIR');

/** `record_telemetry` accepts at most this many entries per transaction. */
export const MAX_ENTRIES_PER_BATCH = 20;

/**
 * - `in_sync`: every batch this backend sent has landed or can no longer land, and the chain
 *   head is the one this backend expects (or, with nothing recorded yet, is taken as given).
 * - `pending`: a sent batch has not landed and its blockhash is still valid.
 * - `diverged`: the chain holds a head this backend did not write; nothing more is written.
 * - `no_project`: the project account does not exist.
 */
export type ChainState = 'in_sync' | 'pending' | 'diverged' | 'no_project';

export type ChainView =
  | { state: 'no_project'; project: null; detail: string }
  | { state: Exclude<ChainState, 'no_project'>; project: ProjectAccount; detail: string | null };

export interface SyncResult {
  state: ChainState | 'no_oracle_key' | 'foreign_oracle' | 'not_operating' | 'batch_failed';
  written: number;
  detail: string | null;
}

function chainTip(project: ProjectAccount): { count: number; head: string; lastDate: string } {
  return {
    count: project.telemetryCount,
    head: Buffer.from(project.telemetryHead).toString('hex'),
    // An empty chain has no last date; '' sorts before every date.
    lastDate: project.lastTelemetryDate === 0 ? '' : isoFromDateNumber(project.lastTelemetryDate),
  };
}

function isRecordable(project: ProjectAccount): boolean {
  return 'operating' in project.state || 'paused' in project.state;
}

/**
 * The oracle's writer. It appends collected days to the project's on-chain telemetry chain in
 * batches, and keeps the local copy of the chain in step with what actually landed.
 */
@Injectable()
export class TelemetryChainService {
  private readonly logger = new Logger(TelemetryChainService.name);
  private readonly queue = new KeyedSerialQueue();

  constructor(
    private readonly solana: SolanaService,
    private readonly accounts: ProgramAccounts,
    private readonly store: TelemetryStore,
    @Inject(ORACLE_KEYPAIR) private readonly oracle: Keypair | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  oracleKey(): Keypair | null {
    return this.oracle;
  }

  /** Settles the outcome of the last sent batch and compares the local chain with the program's. */
  reconcile(car: FleetCar): Promise<ChainView> {
    return this.queue.run(car.mintAddress, () => this.reconcileNow(car));
  }

  /** Reconciles, then appends every collected day the chain does not hold yet, oldest first. */
  sync(car: FleetCar): Promise<SyncResult> {
    return this.queue.run(car.mintAddress, () => this.syncNow(car));
  }

  private async reconcileNow(car: FleetCar): Promise<ChainView> {
    const project = await this.accounts.project(car.mint);
    if (project === null) {
      return { state: 'no_project', project, detail: 'the project account does not exist' };
    }
    const tip = chainTip(project);
    const pending = this.store.pendingSubmission(car.mintAddress);

    if (pending !== null) {
      const links = this.store.submissionLinks(pending.signature);
      const first = links[0];
      const last = links[links.length - 1];
      if (tip.count === last.position && tip.head === last.headAfter) {
        this.store.confirmSubmission(pending.signature, this.clock.now());
        this.logger.log(`${car.mintAddress}: batch ${pending.signature} confirmed on reconcile`);
        return { state: 'in_sync', project, detail: null };
      }
      if (tip.count === first.position - 1 && tip.head === first.headBefore) {
        const height = await this.solana.connection.getBlockHeight('confirmed');
        if (height <= pending.lastValidBlockHeight) {
          return { state: 'pending', project, detail: `batch ${pending.signature} may still land` };
        }
        this.store.abandonSubmission(pending.signature, 'expired');
        this.logger.warn(`${car.mintAddress}: batch ${pending.signature} expired; resending later`);
        return { state: 'in_sync', project, detail: null };
      }
      return this.diverged(car, project, `batch ${pending.signature}`);
    }

    const local = this.store.confirmedTip(car.mintAddress);
    if (local === null || (local.position === tip.count && local.headAfter === tip.head)) {
      return { state: 'in_sync', project, detail: null };
    }
    return this.diverged(car, project, `batch ${local.txSignature}`);
  }

  private diverged(car: FleetCar, project: ProjectAccount, expected: string): ChainView {
    const tip = chainTip(project);
    const detail = `the chain is at count ${tip.count}, head ${tip.head}, which does not follow ${expected}`;
    this.logger.error(`${car.mintAddress}: telemetry chain diverged: ${detail}`);
    return { state: 'diverged', project, detail };
  }

  private async syncNow(car: FleetCar): Promise<SyncResult> {
    const view = await this.reconcileNow(car);
    if (view.state !== 'in_sync') {
      return { state: view.state, written: 0, detail: view.detail };
    }
    const project = view.project;
    if (this.oracle === null) {
      return { state: 'no_oracle_key', written: 0, detail: 'ORACLE_KEYPAIR_PATH is not set' };
    }
    if (!project.oracle.equals(this.oracle.publicKey)) {
      const detail = `the project's oracle is ${project.oracle.toBase58()}`;
      this.logger.error(`${car.mintAddress}: not writing telemetry: ${detail}`);
      return { state: 'foreign_oracle', written: 0, detail };
    }
    if (!isRecordable(project)) {
      return {
        state: 'not_operating',
        written: 0,
        detail: `project state is ${Object.keys(project.state)[0]}`,
      };
    }

    const tip = chainTip(project);
    const stranded = this.store.countStranded(car.mintAddress, tip.lastDate);
    if (stranded > 0) {
      this.logger.warn(
        `${car.mintAddress}: ${stranded} collected days are not later than the chain's last date ${tip.lastDate} and stay off-chain`,
      );
    }
    const days = this.store.unsubmittedAfter(car.mintAddress, tip.lastDate);
    const links = this.plan(tip, days);
    let written = 0;
    for (let start = 0; start < days.length; start += MAX_ENTRIES_PER_BATCH) {
      const batch = days.slice(start, start + MAX_ENTRIES_PER_BATCH);
      const batchLinks = links.slice(start, start + MAX_ENTRIES_PER_BATCH);
      const outcome = await this.writeBatch(car, this.oracle, batch, batchLinks);
      if (outcome !== 'confirmed') {
        return { state: outcome, written, detail: null };
      }
      written += batch.length;
    }
    return { state: 'in_sync', written, detail: null };
  }

  /** Chain positions and heads the days take when appended after `tip`, in order. */
  private plan(tip: { count: number; head: string }, days: StoredDay[]): PlannedLink[] {
    let head = tip.head;
    return days.map((day, index) => {
      const headBefore = head;
      head = nextHead(headBefore, day.date, day.dataHash);
      return { date: day.date, position: tip.count + index + 1, headBefore, headAfter: head };
    });
  }

  private async writeBatch(
    car: FleetCar,
    oracle: Keypair,
    batch: StoredDay[],
    links: PlannedLink[],
  ): Promise<'confirmed' | 'pending' | 'batch_failed'> {
    const instruction = await this.solana.program.methods
      .recordTelemetry(
        batch.map((day) => ({
          date: dateNumber(day.date),
          dataHash: Array.from(Buffer.from(day.dataHash, 'hex')),
          trips: day.figures.trips,
          km: day.figures.km,
          rentPaid: day.figures.rentCharged,
          status: VEHICLE_STATUS_CODES[day.figures.status],
        })),
      )
      .accountsStrict({
        oracle: oracle.publicKey,
        project: this.accounts.projectAddress(car.mint),
      })
      .instruction();
    const signed = await this.solana.sign([instruction], oracle);
    this.store.recordSubmission(
      {
        signature: signed.signature,
        mint: car.mintAddress,
        lastValidBlockHeight: signed.lastValidBlockHeight,
      },
      links,
      this.clock.now(),
    );

    try {
      await this.solana.sendAndConfirmSigned(signed);
    } catch (err) {
      if (
        err instanceof TransactionFailedError ||
        err instanceof TransactionExpiredBlockheightExceededError
      ) {
        this.store.abandonSubmission(
          signed.signature,
          err instanceof TransactionFailedError ? 'failed' : 'expired',
        );
        this.logger.error(`${car.mintAddress}: telemetry batch did not land: ${err.message}`);
        return 'batch_failed';
      }
      // The batch may or may not have been received; the next reconcile settles it.
      this.logger.warn(
        `${car.mintAddress}: outcome of batch ${signed.signature} unknown: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 'pending';
    }
    this.store.confirmSubmission(signed.signature, this.clock.now());
    this.logger.log(
      `${car.mintAddress}: recorded ${batch.length} days ${batch[0].date}..${batch[batch.length - 1].date}: ${signed.signature}`,
    );
    return 'confirmed';
  }
}
