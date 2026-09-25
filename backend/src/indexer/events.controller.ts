import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { parsePublicKey } from '../common/public-key';
import { ProgramAccounts } from '../solana/program-accounts';
import { EventDecoder, type EventData } from './event-decoder';
import { IndexerStore, type StoredEvent, UNKNOWN_EVENT } from './indexer.store';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

interface EventResponse {
  /** Increases in chain order; pass the smallest one seen as `before` for the next page. */
  id: number;
  signature: string;
  /** Position of the event among the program's events in the transaction. */
  index: number;
  slot: number;
  blockTime: string | null;
  type: string;
  project: string | null;
  data: EventData | null;
}

interface EventPage {
  events: EventResponse[];
  /** `before` for the next, older page; `null` on the last page. */
  nextBefore: number | null;
}

interface ProjectHistoryResponse extends EventPage {
  mint: string;
  project: string;
}

interface ClaimResponse {
  id: number;
  signature: string;
  slot: number;
  blockTime: string | null;
  project: string;
  claimer: string;
  /** Base units of the payment mint. */
  amount: string;
}

interface ClaimsResponse {
  owner: string;
  claims: ClaimResponse[];
  nextBefore: number | null;
  /** Every claim of the owner (within `project`, if given), not only this page. */
  totals: { project: string; amount: string; claims: number }[];
}

interface PageQuery {
  before?: number;
  limit: number;
}

function integerParam(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be an integer`);
  }
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new BadRequestException(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function pageQuery(before: unknown, limit: unknown): PageQuery {
  return {
    before:
      before === undefined ? undefined : integerParam(before, 'before', 1, Number.MAX_SAFE_INTEGER),
    limit: limit === undefined ? DEFAULT_PAGE_SIZE : integerParam(limit, 'limit', 1, MAX_PAGE_SIZE),
  };
}

function isoTime(blockTime: number | null): string | null {
  return blockTime === null ? null : new Date(blockTime * 1000).toISOString();
}

/** Fetches one row more than the page to tell whether an older page exists. */
function paged<T extends { id: number }>(
  rows: T[],
  limit: number,
): { rows: T[]; nextBefore: number | null } {
  const page = rows.slice(0, limit);
  return {
    rows: page,
    nextBefore: rows.length > limit ? page[page.length - 1].id : null,
  };
}

/** Indexed axel_v2 events, newest first. */
@Controller()
export class EventsController {
  private readonly types: Set<string>;

  constructor(
    private readonly store: IndexerStore,
    private readonly accounts: ProgramAccounts,
    decoder: EventDecoder,
  ) {
    this.types = new Set([...decoder.types, UNKNOWN_EVENT]);
  }

  @Get('events')
  events(
    @Query('project') project: unknown,
    @Query('type') type: unknown,
    @Query('before') before: unknown,
    @Query('limit') limit: unknown,
  ): EventPage {
    const page = pageQuery(before, limit);
    return this.eventPage({
      project: project === undefined ? undefined : parsePublicKey(project, 'project').toBase58(),
      types: this.typesParam(type),
      ...page,
    });
  }

  @Get('projects/:mint/history')
  history(
    @Param('mint') mint: string,
    @Query('type') type: unknown,
    @Query('before') before: unknown,
    @Query('limit') limit: unknown,
  ): ProjectHistoryResponse {
    const page = pageQuery(before, limit);
    const types = this.typesParam(type);
    const project = this.accounts.projectAddress(parsePublicKey(mint, 'mint')).toBase58();
    if (!this.store.hasEvent('ProjectCreated', project)) {
      throw new NotFoundException(`No project with share mint ${mint} is indexed`);
    }
    return { mint, project, ...this.eventPage({ project, types, ...page }) };
  }

  @Get('positions/:owner/claims')
  claims(
    @Param('owner') owner: string,
    @Query('project') project: unknown,
    @Query('before') before: unknown,
    @Query('limit') limit: unknown,
  ): ClaimsResponse {
    const page = pageQuery(before, limit);
    const wallet = parsePublicKey(owner, 'owner').toBase58();
    const projectFilter =
      project === undefined ? undefined : parsePublicKey(project, 'project').toBase58();
    const { rows, nextBefore } = paged(
      this.store.events({
        owner: wallet,
        project: projectFilter,
        types: ['Claimed'],
        before: page.before,
        limit: page.limit + 1,
      }),
      page.limit,
    );
    return {
      owner: wallet,
      claims: rows.map((event) => {
        const data = event.data as { project: string; claimer: string; amount: string };
        return {
          id: event.id,
          signature: event.signature,
          slot: event.slot,
          blockTime: isoTime(event.blockTime),
          project: data.project,
          claimer: data.claimer,
          amount: data.amount,
        };
      }),
      nextBefore,
      totals: this.store.claimTotals(wallet, projectFilter).map((total) => ({
        project: total.project,
        amount: total.amount.toString(),
        claims: total.claims,
      })),
    };
  }

  private eventPage(query: {
    project?: string;
    types?: string[];
    before?: number;
    limit: number;
  }): EventPage {
    const { rows, nextBefore } = paged(
      this.store.events({ ...query, limit: query.limit + 1 }),
      query.limit,
    );
    return { events: rows.map((event) => this.eventResponse(event)), nextBefore };
  }

  private eventResponse(event: StoredEvent): EventResponse {
    return {
      id: event.id,
      signature: event.signature,
      index: event.index,
      slot: event.slot,
      blockTime: isoTime(event.blockTime),
      type: event.type,
      project: event.project,
      data: event.data,
    };
  }

  /** `type` is one event type or several separated by commas. */
  private typesParam(value: unknown): string[] | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException('type must be one or more event types separated by commas');
    }
    const types = value.split(',');
    const unknown = types.filter((type) => !this.types.has(type));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown event type: ${unknown.join(', ')}`);
    }
    return types;
  }
}
