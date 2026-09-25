import { Inject, Injectable } from '@nestjs/common';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { type AxelProgram, createAxelProgram } from './axel-program';

export const SOLANA_CONNECTION = Symbol('SOLANA_CONNECTION');

export class TransactionFailedError extends Error {
  constructor(
    readonly signature: string,
    readonly error: unknown,
  ) {
    super(`Transaction ${signature} failed: ${JSON.stringify(error)}`);
  }
}

@Injectable()
export class SolanaService {
  readonly program: AxelProgram;

  constructor(
    @Inject(SOLANA_CONNECTION) readonly connection: Connection,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.program = createAxelProgram(connection, config.solana.programId);
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  async isRpcConnected(): Promise<boolean> {
    try {
      await this.connection.getSlot();
      return true;
    } catch {
      return false;
    }
  }

  /** Signs with `signer` as fee payer, sends, and waits for `confirmed`. Throws if the transaction fails. */
  async sendAndConfirm(instructions: TransactionInstruction[], signer: Keypair): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([signer]);

    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    const { value } = await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );
    if (value.err !== null) {
      throw new TransactionFailedError(signature, value.err);
    }
    return signature;
  }
}
