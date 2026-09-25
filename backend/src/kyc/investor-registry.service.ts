import { BN, type IdlAccounts, type IdlTypes } from '@coral-xyz/anchor';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Keypair, PublicKey } from '@solana/web3.js';

import type { AxelV2Idl } from '../solana/axel-program';
import { investorAddress } from '../solana/axel-program';
import { SolanaService } from '../solana/solana.service';
import type { InvestorPlan, InvestorRecord, InvestorStatus, KycProvider } from './investor-plan';

export const KYC_AUTHORITY = Symbol('KYC_AUTHORITY');

type InvestorAccount = IdlAccounts<AxelV2Idl>['investor'];
type SetInvestorParams = IdlTypes<AxelV2Idl>['setInvestorParams'];

const STATUS_ARGS: Record<InvestorStatus, SetInvestorParams['status']> = {
  active: { active: {} },
  revoked: { revoked: {} },
  frozen: { frozen: {} },
};

const PROVIDER_ARGS: Record<KycProvider, SetInvestorParams['provider']> = {
  manual: { manual: {} },
  sumsub: { sumsub: {} },
  demo: { demo: {} },
};

function decodeStatus(status: InvestorAccount['status']): InvestorStatus | null {
  if ('active' in status) return 'active';
  if ('revoked' in status) return 'revoked';
  if ('frozen' in status) return 'frozen';
  return null;
}

function decodeProvider(provider: InvestorAccount['provider']): KycProvider {
  if ('sumsub' in provider) return 'sumsub';
  if ('demo' in provider) return 'demo';
  return 'manual';
}

export interface InvestorUpdateResult {
  outcome: 'applied' | 'unchanged' | 'blocked';
  reason: string | null;
  signature: string | null;
}

/** Reads and writes `Investor` records with the dedicated KYC authority key. */
@Injectable()
export class InvestorRegistry implements OnModuleInit {
  private readonly logger = new Logger(InvestorRegistry.name);

  constructor(
    private readonly solana: SolanaService,
    @Inject(KYC_AUTHORITY) private readonly authority: Keypair | null,
  ) {}

  onModuleInit(): void {
    if (this.authority === null) {
      this.logger.warn(
        'KYC_AUTHORITY_KEYPAIR_PATH is not set: Sumsub events cannot update KYC records',
      );
    } else {
      this.logger.log(
        `KYC authority ${this.authority.publicKey.toBase58()}, program ${this.solana.programId.toBase58()}`,
      );
    }
  }

  isConfigured(): boolean {
    return this.authority !== null;
  }

  async fetch(wallet: PublicKey): Promise<InvestorRecord | null> {
    const address = investorAddress(this.solana.programId, wallet);
    const info = await this.solana.connection.getAccountInfo(address, 'confirmed');
    // Anyone can send lamports to the address before the record exists; `set_investor` still
    // creates it then, so only a program-owned account counts as a record.
    if (info === null || !info.owner.equals(this.solana.programId)) {
      return null;
    }
    const account = this.solana.program.coder.accounts.decode<InvestorAccount>(
      'investor',
      info.data,
    );
    const status = decodeStatus(account.status);
    if (status === null) {
      return null;
    }
    return {
      status,
      flags: account.flags,
      jurisdiction: account.jurisdiction,
      expiresAt: account.expiresAt.toNumber(),
      provider: decodeProvider(account.provider),
    };
  }

  /** Reads the current record, asks `plan` what it should become, and writes it only if it changes. */
  async update(
    wallet: PublicKey,
    plan: (current: InvestorRecord | null) => InvestorPlan,
  ): Promise<InvestorUpdateResult> {
    const authority = this.requireAuthority();
    const step = plan(await this.fetch(wallet));
    if (step.kind !== 'write') {
      return { outcome: step.kind, reason: step.reason, signature: null };
    }

    const instruction = await this.solana.program.methods
      .setInvestor(wallet, {
        status: STATUS_ARGS[step.record.status],
        expiresAt: new BN(step.record.expiresAt),
        jurisdiction: step.record.jurisdiction,
        flags: step.record.flags,
        provider: PROVIDER_ARGS[step.record.provider],
      })
      .accounts({ authority: authority.publicKey })
      .instruction();
    const signature = await this.solana.sendAndConfirm([instruction], authority);
    this.logger.log(`set_investor ${wallet.toBase58()} -> ${step.record.status}: ${signature}`);
    return { outcome: 'applied', reason: null, signature };
  }

  private requireAuthority(): Keypair {
    if (this.authority === null) {
      throw new ServiceUnavailableException('KYC authority keypair is not configured');
    }
    return this.authority;
  }
}
