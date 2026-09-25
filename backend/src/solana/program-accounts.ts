import type { IdlAccounts } from '@coral-xyz/anchor';
import { Injectable } from '@nestjs/common';
import { type AccountInfo, PublicKey } from '@solana/web3.js';

import { type AxelV2Idl, configAddress, periodAddress, projectAddress } from './axel-program';
import { SolanaService } from './solana.service';

export type ConfigAccount = IdlAccounts<AxelV2Idl>['config'];
export type ProjectAccount = IdlAccounts<AxelV2Idl>['project'];
export type RevenuePeriodAccount = IdlAccounts<AxelV2Idl>['revenuePeriod'];

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/** Size of the base SPL mint layout, shared by Token-2022 mints before their extensions. */
const MINT_SIZE = 82;
const MINT_DECIMALS_OFFSET = 44;
const MINT_INITIALIZED_OFFSET = 45;
/** Addresses per `getMultipleAccounts` call, the RPC's limit. */
const MULTIPLE_ACCOUNTS_LIMIT = 100;

/** Reads and decodes axel_v2 accounts and payment mints. */
@Injectable()
export class ProgramAccounts {
  constructor(private readonly solana: SolanaService) {}

  projectAddress(shareMint: PublicKey): PublicKey {
    return projectAddress(this.solana.programId, shareMint);
  }

  configAddress(): PublicKey {
    return configAddress(this.solana.programId);
  }

  async config(): Promise<ConfigAccount | null> {
    const info = await this.solana.connection.getAccountInfo(this.configAddress(), 'confirmed');
    if (!this.isProgramAccount(info)) {
      return null;
    }
    return this.solana.program.coder.accounts.decode<ConfigAccount>('config', info.data);
  }

  async project(shareMint: PublicKey): Promise<ProjectAccount | null> {
    const info = await this.solana.connection.getAccountInfo(
      this.projectAddress(shareMint),
      'confirmed',
    );
    if (!this.isProgramAccount(info)) {
      return null;
    }
    return this.solana.program.coder.accounts.decode<ProjectAccount>('project', info.data);
  }

  /** Decimals of a SPL Token or Token-2022 mint. */
  async mintDecimals(mint: PublicKey): Promise<number> {
    const info = await this.solana.connection.getAccountInfo(mint, 'confirmed');
    if (
      info === null ||
      !(info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID)) ||
      info.data.length < MINT_SIZE ||
      info.data[MINT_INITIALIZED_OFFSET] !== 1
    ) {
      throw new Error(`${mint.toBase58()} is not an initialized token mint`);
    }
    return info.data[MINT_DECIMALS_OFFSET];
  }

  /** The project's revenue periods, indices 0 to `count - 1`. */
  async revenuePeriods(project: PublicKey, count: number): Promise<RevenuePeriodAccount[]> {
    const addresses = Array.from({ length: count }, (_, index) =>
      periodAddress(this.solana.programId, project, index),
    );
    const periods: RevenuePeriodAccount[] = [];
    for (let start = 0; start < addresses.length; start += MULTIPLE_ACCOUNTS_LIMIT) {
      const chunk = addresses.slice(start, start + MULTIPLE_ACCOUNTS_LIMIT);
      const infos = await this.solana.connection.getMultipleAccountsInfo(chunk, 'confirmed');
      infos.forEach((info, offset) => {
        if (!this.isProgramAccount(info)) {
          throw new Error(`Revenue period ${start + offset} of ${project.toBase58()} is missing`);
        }
        periods.push(
          this.solana.program.coder.accounts.decode<RevenuePeriodAccount>(
            'revenuePeriod',
            info.data,
          ),
        );
      });
    }
    return periods;
  }

  private isProgramAccount(info: AccountInfo<Buffer> | null): info is AccountInfo<Buffer> {
    return info !== null && info.owner.equals(this.solana.programId);
  }
}
