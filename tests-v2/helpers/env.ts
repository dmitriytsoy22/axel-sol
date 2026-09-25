import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Program, type IdlAccounts } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { Clock, FailedTransactionMetadata, LiteSVM, type TransactionMetadata } from "litesvm";
import type { AxelV2 } from "../../target/types/axel_v2";
import idl from "../../target/idl/axel_v2.json" with { type: "json" };

export { idl };

/**
 * Typed instruction builders and coders for axel_v2. Instructions are built offline with
 * `accountsStrict` and executed by LiteSVM, so this connection is never contacted.
 */
export const program = new Program<AxelV2>(idl as AxelV2, {
  connection: new Connection("http://127.0.0.1:8899"),
});
export const PROGRAM_ID = program.programId;

export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

/** 2026-10-01T00:00:00Z: every environment starts from the same wall clock. */
export const GENESIS_TIMESTAMP = BigInt(Date.UTC(2026, 9, 1) / 1000);

const programBytes = readFileSync(
  fileURLToPath(new URL("../../target/deploy/axel_v2.so", import.meta.url)),
);

export type TxResult = TransactionMetadata | FailedTransactionMetadata;
export type AccountName = keyof IdlAccounts<AxelV2>;

export function bn(value: bigint | number): BN {
  return new BN(value.toString());
}

export function big(value: BN): bigint {
  return BigInt(value.toString());
}

export function programDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_LOADER_UPGRADEABLE_ID)[0];
}

/**
 * Deploys `bytes` under the upgradeable loader and sets the upgrade authority
 * (`null` makes the program immutable). LiteSVM deploys with no authority, so the
 * ProgramData header is rewritten: u32 tag, u64 slot, Option<Pubkey> authority.
 */
export function deployUpgradeable(
  svm: LiteSVM,
  programId: PublicKey,
  bytes: Uint8Array,
  upgradeAuthority: PublicKey | null,
): void {
  svm.addProgram(programId, bytes);
  const address = programDataAddress(programId);
  const account = svm.getAccount(address);
  if (account === null) {
    throw new Error(`LiteSVM did not create ProgramData for ${programId.toBase58()}`);
  }
  const data = Buffer.from(account.data);
  data[12] = upgradeAuthority === null ? 0 : 1;
  (upgradeAuthority ?? PublicKey.default).toBuffer().copy(data, 13);
  svm.setAccount(address, { ...account, data });
}

/** A fresh LiteSVM instance with axel_v2 deployed; one per test keeps tests isolated. */
export class TestEnv {
  readonly svm: LiteSVM;
  readonly upgradeAuthority: Keypair;

  constructor(options: { upgradeAuthority?: "keypair" | "none" } = {}) {
    this.svm = new LiteSVM();
    const clock = this.svm.getClock();
    this.svm.setClock(
      new Clock(clock.slot, GENESIS_TIMESTAMP, clock.epoch, clock.leaderScheduleEpoch, GENESIS_TIMESTAMP),
    );
    this.upgradeAuthority = this.newAccount();
    deployUpgradeable(
      this.svm,
      PROGRAM_ID,
      programBytes,
      options.upgradeAuthority === "none" ? null : this.upgradeAuthority.publicKey,
    );
  }

  /** Deploys another copy of axel_v2 under `programId`, e.g. to forge ProgramData. */
  deployCopy(programId: PublicKey, upgradeAuthority: PublicKey): void {
    deployUpgradeable(this.svm, programId, programBytes, upgradeAuthority);
  }

  newAccount(sol = 10): Keypair {
    const keypair = Keypair.generate();
    this.svm.airdrop(keypair.publicKey, BigInt(sol * LAMPORTS_PER_SOL));
    return keypair;
  }

  now(): bigint {
    return this.svm.getClock().unixTimestamp;
  }

  warp(seconds: bigint): void {
    const clock = this.svm.getClock();
    clock.unixTimestamp += seconds;
    clock.slot += 1n;
    this.svm.setClock(clock);
  }

  warpTo(timestamp: bigint): void {
    this.warp(timestamp - this.now());
  }

  /** A transaction signed by every signer; the first one pays the fees. */
  transaction(instructions: TransactionInstruction[], signers: Keypair[]): Transaction {
    const tx = new Transaction({
      feePayer: signers[0].publicKey,
      recentBlockhash: this.svm.latestBlockhash(),
    }).add(...instructions);
    tx.sign(...signers);
    return tx;
  }

  /** Signs with every signer (the first pays fees) and executes one transaction. */
  send(instructions: TransactionInstruction[], signers: Keypair[]): TxResult {
    const result = this.svm.sendTransaction(this.transaction(instructions, signers));
    // A new blockhash lets the next identical transaction run instead of being deduplicated.
    this.svm.expireBlockhash();
    return result;
  }

  balance(address: PublicKey): bigint {
    return this.svm.getBalance(address) ?? 0n;
  }

  exists(address: PublicKey): boolean {
    return this.svm.getAccount(address) !== null;
  }

  fetch<N extends AccountName>(name: N, address: PublicKey): IdlAccounts<AxelV2>[N] {
    const account = this.svm.getAccount(address);
    if (account === null) {
      throw new Error(`${String(name)} account ${address.toBase58()} does not exist`);
    }
    return program.coder.accounts.decode<IdlAccounts<AxelV2>[N]>(name, Buffer.from(account.data));
  }

  /**
   * Rewrites fields of a program account in place, to put the program into a state that a
   * test needs but that is expensive or not yet possible to reach through instructions.
   */
  async patch<N extends AccountName>(
    name: N,
    address: PublicKey,
    changes: Partial<IdlAccounts<AxelV2>[N]>,
  ): Promise<void> {
    const account = this.svm.getAccount(address);
    if (account === null) {
      throw new Error(`${String(name)} account ${address.toBase58()} does not exist`);
    }
    const data = await program.coder.accounts.encode(name, { ...this.fetch(name, address), ...changes });
    if (data.length !== account.data.length) {
      throw new Error(`re-encoded ${String(name)} is ${data.length} bytes instead of ${account.data.length}`);
    }
    this.svm.setAccount(address, { ...account, data });
  }
}
