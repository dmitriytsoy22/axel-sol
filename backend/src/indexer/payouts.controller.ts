import { Controller, Get, Param } from '@nestjs/common';

import { parsePublicKey } from '../common/public-key';
import { IndexerStore } from './indexer.store';
import { type ClaimPayout, type PeriodPayout, type ProjectPayout, replayPosition } from './payouts';

interface PayoutHistoryResponse {
  wallet: string;
  /** Newest slot the index holds a transaction of: the figures are as of that slot. */
  slot: number | null;
  /** Every project in which the wallet has opened a position, in that order. */
  projects: ProjectPayout[];
  /** Newest first. */
  periods: PeriodPayout[];
  /** Newest first. */
  claims: ClaimPayout[];
}

const newestFirst = (a: { id: number }, b: { id: number }): number => b.id - a.id;

/** A wallet's revenue across its cars, from the indexed events alone. */
@Controller('v2/wallets')
export class PayoutsController {
  constructor(private readonly store: IndexerStore) {}

  @Get(':wallet/payouts')
  payouts(@Param('wallet') wallet: string): PayoutHistoryResponse {
    const owner = parsePublicKey(wallet, 'wallet').toBase58();
    const slot = this.store.latestSlot();
    const replays = this.store
      .positionProjects(owner)
      .map((project) => replayPosition(project, owner, this.store.positionEvents(project, owner)));
    return {
      wallet: owner,
      slot,
      projects: replays.map((replay) => replay.summary),
      periods: replays.flatMap((replay) => replay.periods).sort(newestFirst),
      claims: replays.flatMap((replay) => replay.claims).sort(newestFirst),
    };
  }
}
