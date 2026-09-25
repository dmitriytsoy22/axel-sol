import { utils } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SendTransactionError,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  type AccountInfo,
  type Keypair,
  type TransactionInstruction,
} from "@solana/web3.js";

export const CLUSTERS = ["localnet", "devnet"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const DEFAULT_RPC: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
};

/** Packet limit of a legacy transaction. */
export const MAX_TRANSACTION_SIZE = 1_232;
/** Base fee per signature; no priority fees are paid. */
export const LAMPORTS_PER_SIGNATURE = 5_000n;

const POLL_MS = 500;
const RESEND_EVERY_POLLS = 4;
const MAX_ACCOUNTS_PER_CALL = 100;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A transaction that landed but failed, with its logs. */
export class TransactionFailedError extends Error {
  constructor(
    readonly signature: string,
    readonly logs: string[],
    message: string,
  ) {
    super(`${message}\n  ${logs.join("\n  ")}`);
  }
}

export type SignatureOutcome = "confirmed" | "failed" | "expired" | "unknown";

export class Chain {
  private readonly rentCache = new Map<number, bigint>();
  private readonly recentSignatures = new Set<string>();

  constructor(readonly connection: Connection) {}

  static connect(rpc: string): Chain {
    return new Chain(new Connection(rpc, { commitment: "confirmed" }));
  }

  /** `Clock::unix_timestamp`, the time the program compares deadlines with. */
  async clock(): Promise<number> {
    const account = await this.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
    if (account === null) {
      throw new Error("the cluster has no Clock sysvar");
    }
    return Number(account.data.readBigInt64LE(32));
  }

  async rent(size: number): Promise<bigint> {
    let lamports = this.rentCache.get(size);
    if (lamports === undefined) {
      lamports = BigInt(await this.connection.getMinimumBalanceForRentExemption(size));
      this.rentCache.set(size, lamports);
    }
    return lamports;
  }

  async balance(address: PublicKey): Promise<bigint> {
    return BigInt(await this.connection.getBalance(address));
  }

  async account(address: PublicKey): Promise<AccountInfo<Buffer> | null> {
    return this.connection.getAccountInfo(address);
  }

  async accounts(addresses: PublicKey[]): Promise<Array<AccountInfo<Buffer> | null>> {
    const result: Array<AccountInfo<Buffer> | null> = [];
    for (let i = 0; i < addresses.length; i += MAX_ACCOUNTS_PER_CALL) {
      result.push(...(await this.connection.getMultipleAccountsInfo(addresses.slice(i, i + MAX_ACCOUNTS_PER_CALL))));
    }
    return result;
  }

  async exists(address: PublicKey): Promise<boolean> {
    return (await this.account(address)) !== null;
  }

  /**
   * Signs a transaction with a fresh blockhash. A signature this process already sent is
   * never reused: an identical transaction would be deduplicated by the cluster instead of
   * executing again.
   */
  async sign(
    instructions: TransactionInstruction[],
    feePayer: Keypair,
    signers: Keypair[],
  ): Promise<{ transaction: Transaction; signature: string; lastValidBlockHeight: number }> {
    for (;;) {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({ feePayer: feePayer.publicKey, blockhash, lastValidBlockHeight }).add(
        ...instructions,
      );
      const unique = [feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey))];
      transaction.sign(...unique);
      const signature = utils.bytes.bs58.encode(transaction.signature!);
      if (!this.recentSignatures.has(signature)) {
        return { transaction, signature, lastValidBlockHeight };
      }
      await sleep(POLL_MS);
    }
  }

  /** Sends a signed transaction and waits until it is confirmed, fails or expires. */
  async submit(transaction: Transaction, signature: string, lastValidBlockHeight: number): Promise<SignatureOutcome> {
    const raw = transaction.serialize();
    if (raw.length > MAX_TRANSACTION_SIZE) {
      throw new Error(`transaction is ${raw.length} bytes, over the ${MAX_TRANSACTION_SIZE}-byte limit`);
    }
    this.recentSignatures.add(signature);
    try {
      await this.connection.sendRawTransaction(raw, { preflightCommitment: "confirmed", maxRetries: 0 });
    } catch (error) {
      if (error instanceof SendTransactionError) {
        throw new TransactionFailedError(signature, error.logs ?? [], `simulation failed: ${error.transactionError.message}`);
      }
      throw error;
    }
    for (let poll = 1; ; poll++) {
      const outcome = await this.outcome(signature, lastValidBlockHeight);
      if (outcome !== "unknown") {
        return outcome;
      }
      if (poll % RESEND_EVERY_POLLS === 0) {
        // Best effort against dropped packets; a failed resend changes nothing, because the
        // next status poll decides the outcome either way.
        await this.connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
      }
      await sleep(POLL_MS);
    }
  }

  /**
   * What happened to a signature: confirmed, failed, expired (it can no longer land) or
   * still unknown (its blockhash is valid and it may yet land). `searchHistory` also looks
   * past the RPC's recent status cache, for signatures from an earlier run.
   */
  async outcome(signature: string, lastValidBlockHeight: number, searchHistory = false): Promise<SignatureOutcome> {
    const { value } = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: searchHistory,
    });
    const status = value[0];
    if (status !== null) {
      if (status.err !== null) {
        return "failed";
      }
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return "confirmed";
      }
      return "unknown";
    }
    // Expired only once no fork can still include it: the finalized height is past its
    // blockhash, and even the full history does not know the signature.
    const height = await this.connection.getBlockHeight("finalized");
    if (height <= lastValidBlockHeight) {
      return "unknown";
    }
    if (!searchHistory) {
      return this.outcome(signature, lastValidBlockHeight, true);
    }
    return "expired";
  }

  async logs(signature: string): Promise<string[]> {
    const transaction = await this.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return transaction?.meta?.logMessages ?? [];
  }
}
