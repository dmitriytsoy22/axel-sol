import {
  AccountState,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeInterestBearingMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializePausableConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createMintToCheckedInstruction,
  ExtensionType,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
  unpackMint,
  type Account as TokenAccount,
  type Mint,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { expectOk } from "./assert";
import type { TestEnv } from "./env";

export { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };

/** tKZT-like stablecoin precision. */
export const PAYMENT_DECIMALS = 6;

export const TOKEN_PROGRAMS = [
  ["SPL Token", TOKEN_PROGRAM_ID],
  ["Token-2022", TOKEN_2022_PROGRAM_ID],
] as const;

/** A Token-2022 mint extension together with the instruction that initializes it. */
export interface MintExtension {
  type: ExtensionType;
  init: (mint: PublicKey, authority: PublicKey) => TransactionInstruction;
}

const T22 = TOKEN_2022_PROGRAM_ID;

export const MintExtensions = {
  transferFee: {
    type: ExtensionType.TransferFeeConfig,
    init: (mint, authority) => createInitializeTransferFeeConfigInstruction(mint, authority, authority, 0, 0n, T22),
  },
  transferHookWithProgram: {
    type: ExtensionType.TransferHook,
    init: (mint, authority) => createInitializeTransferHookInstruction(mint, authority, Keypair.generate().publicKey, T22),
  },
  transferHookWithoutProgram: {
    type: ExtensionType.TransferHook,
    init: (mint, authority) => createInitializeTransferHookInstruction(mint, authority, PublicKey.default, T22),
  },
  nonTransferable: {
    type: ExtensionType.NonTransferable,
    init: (mint) => createInitializeNonTransferableMintInstruction(mint, T22),
  },
  defaultFrozen: {
    type: ExtensionType.DefaultAccountState,
    init: (mint) => createInitializeDefaultAccountStateInstruction(mint, AccountState.Frozen, T22),
  },
  defaultInitialized: {
    type: ExtensionType.DefaultAccountState,
    init: (mint) => createInitializeDefaultAccountStateInstruction(mint, AccountState.Initialized, T22),
  },
  interestBearing: {
    type: ExtensionType.InterestBearingConfig,
    init: (mint, authority) => createInitializeInterestBearingMintInstruction(mint, authority, 500, T22),
  },
  scaledUiAmount: {
    type: ExtensionType.ScaledUiAmountConfig,
    init: (mint, authority) => createInitializeScaledUiAmountConfigInstruction(mint, authority, 2, T22),
  },
  permanentDelegate: {
    type: ExtensionType.PermanentDelegate,
    init: (mint, authority) => createInitializePermanentDelegateInstruction(mint, authority, T22),
  },
  pausable: {
    type: ExtensionType.PausableConfig,
    init: (mint, authority) => createInitializePausableConfigInstruction(mint, authority, T22),
  },
  mintCloseAuthority: {
    type: ExtensionType.MintCloseAuthority,
    init: (mint, authority) => createInitializeMintCloseAuthorityInstruction(mint, authority, T22),
  },
  metadataPointer: {
    type: ExtensionType.MetadataPointer,
    init: (mint, authority) => createInitializeMetadataPointerInstruction(mint, authority, mint, T22),
  },
} satisfies Record<string, MintExtension>;

/**
 * Creates a mint with `authority` as mint and freeze authority. Token-2022 extensions are
 * initialized before the mint itself, as the token program requires.
 */
export function createMint(
  env: TestEnv,
  authority: Keypair,
  programId: PublicKey,
  extensions: MintExtension[] = [],
): PublicKey {
  const mint = Keypair.generate();
  const space = getMintLen(extensions.map((extension) => extension.type));
  expectOk(
    env.send(
      [
        SystemProgram.createAccount({
          fromPubkey: authority.publicKey,
          newAccountPubkey: mint.publicKey,
          space,
          lamports: Number(env.svm.minimumBalanceForRentExemption(BigInt(space))),
          programId,
        }),
        ...extensions.map((extension) => extension.init(mint.publicKey, authority.publicKey)),
        createInitializeMint2Instruction(mint.publicKey, PAYMENT_DECIMALS, authority.publicKey, authority.publicKey, programId),
      ],
      [authority, mint],
    ),
  );
  return mint.publicKey;
}

export function ata(owner: PublicKey, mint: PublicKey, programId: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, programId);
}

export function createAtaIx(payer: PublicKey, owner: PublicKey, mint: PublicKey, programId: PublicKey): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata(owner, mint, programId), owner, mint, programId);
}

/** Mints `amount` to the owner's associated token account, creating it when missing. */
export function mintTo(
  env: TestEnv,
  mint: PublicKey,
  programId: PublicKey,
  authority: Keypair,
  owner: PublicKey,
  amount: bigint,
): PublicKey {
  const destination = ata(owner, mint, programId);
  expectOk(
    env.send(
      [
        createAtaIx(authority.publicKey, owner, mint, programId),
        createMintToCheckedInstruction(mint, destination, authority.publicKey, amount, PAYMENT_DECIMALS, [], programId),
      ],
      [authority],
    ),
  );
  return destination;
}

function rawAccount(env: TestEnv, address: PublicKey) {
  const account = env.svm.getAccount(address);
  if (account === null) {
    throw new Error(`account ${address.toBase58()} does not exist`);
  }
  return { ...account, data: Buffer.from(account.data) };
}

export function readTokenAccount(env: TestEnv, address: PublicKey): TokenAccount {
  const account = rawAccount(env, address);
  return unpackAccount(address, account, account.owner);
}

export function readMint(env: TestEnv, address: PublicKey): Mint {
  const account = rawAccount(env, address);
  return unpackMint(address, account, account.owner);
}

export function tokenBalance(env: TestEnv, address: PublicKey): bigint {
  return readTokenAccount(env, address).amount;
}
