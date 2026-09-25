import { utils } from '@coral-xyz/anchor';
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

/** A transaction signed by the fee payer, not sent yet. Its signature is known in advance. */
export interface SignedTransaction {
  transaction: VersionedTransaction;
  signature: string;
  blockhash: string;
  lastValidBlockHeight: number;
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
    const signed = await this.sign(instructions, signer);
    await this.sendAndConfirmSigned(signed);
    return signed.signature;
  }

  /** Builds a v0 transaction on a fresh blockhash with `signer` as fee payer and signs it. */
  async sign(instructions: TransactionInstruction[], signer: Keypair): Promise<SignedTransaction> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([signer]);
    return {
      transaction,
      signature: utils.bytes.bs58.encode(transaction.signatures[0]),
      blockhash,
      lastValidBlockHeight,
    };
  }

  /**
   * Sends and waits for `confirmed`. Throws `TransactionFailedError` if it landed and failed,
   * and web3.js's `TransactionExpiredBlockheightExceededError` once it can no longer land.
   */
  async sendAndConfirmSigned(signed: SignedTransaction): Promise<void> {
    const signature = await this.connection.sendRawTransaction(signed.transaction.serialize());
    const { value } = await this.connection.confirmTransaction(
      {
        signature,
        blockhash: signed.blockhash,
        lastValidBlockHeight: signed.lastValidBlockHeight,
      },
      'confirmed',
    );
    if (value.err !== null) {
      throw new TransactionFailedError(signature, value.err);
    }
  }
}
