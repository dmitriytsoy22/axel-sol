// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeMintToInstruction,
  decodeTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { INVESTOR_FLAGS } from '@/lib/solana/accounts';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { kycRecord } from '@/lib/solana/kyc';
import { fetchProject } from '@/lib/solana/readers';
import { shareAccountAddress } from '@/lib/solana/pda';
import { accountMismatches } from '@/lib/solana/__tests__/fixtures/idl';
import type { Project } from '@/types/project';
import {
  accessPlan,
  claimPlan,
  DEMO_COMPUTE_UNITS,
  investPlan,
  serializeUnsigned,
  sharesPlan,
  simulateMonthPlan,
  unsignedTransaction,
  type InstructionPlan,
} from '../transactions';
import {
  decodeAxelInstruction,
  demoAccounts,
  DemoNode,
  FLEET_MINT,
  NOW,
  RAISE_MINT,
  roles,
} from './fixtures';

const BLOCKHASH = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';
const wallet = Keypair.generate().publicKey;
const { faucet, demoKyc, desk, operator, oracle } = roles;

async function project(mint: PublicKey): Promise<Project> {
  const loaded = await fetchProject(new DemoNode(await demoAccounts()), mint);
  if (!loaded) throw new Error(`no project for ${mint.toBase58()}`);
  return loaded;
}

/** Transaction of `plan` as a fee payer would send it, with its signers and wire size. */
function compiled(plan: InstructionPlan, feePayer: PublicKey) {
  const transaction = unsignedTransaction(plan, feePayer, BLOCKHASH);
  const message = transaction.compileMessage();
  const signers = message.accountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((key) => key.toBase58());
  // 64 bytes per signature, plus the one-byte signature count.
  const size = message.serialize().length + 1 + 64 * signers.length;
  return { transaction, signers, size };
}

function body(plan: InstructionPlan): TransactionInstruction[] {
  // The compute budget instruction is added when the transaction is built.
  return plan.instructions;
}

function anchorArgs(instruction: TransactionInstruction) {
  const decoded = decodeAxelInstruction(instruction.data);
  if (!decoded) throw new Error('not an axel_v2 instruction');
  return decoded;
}

describe('demo access transaction', () => {
  const payment = {
    mint: new PublicKey('5qGVSmXa3ZJnPcwJ2JZPniSHVjhtDBiGAwaBqPqZdZ2z'),
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  };
  const walletPayment = getAssociatedTokenAddressSync(
    payment.mint,
    wallet,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  it('writes a DEMO record, then drips test tenge and SOL, all paid by the faucet', async () => {
    const plan = await accessPlan({
      faucet: faucet.publicKey,
      demoKyc: demoKyc.publicKey,
      wallet,
      payment,
      kyc: kycRecord('demo', 'approve', NOW),
      kycRent: 1_322_400,
      dripAmount: 50_000_000_000n,
      dripLamports: 10_000_000,
    });
    const [rent, setInvestor, createAccount, mintTo, sol] = body(plan);

    expect(plan.instructions).toHaveLength(5);
    expect(SystemInstruction.decodeTransfer(rent)).toEqual({
      fromPubkey: faucet.publicKey,
      toPubkey: demoKyc.publicKey,
      lamports: 1_322_400n,
    });
    expect(
      accountMismatches('set_investor', setInvestor, PROGRAM_ID, { args: { wallet } }),
    ).toEqual([]);
    expect(setInvestor.keys[0].pubkey).toEqual(demoKyc.publicKey);
    const { data } = anchorArgs(setInvestor) as {
      data: { wallet: PublicKey; params: Record<string, unknown> };
    };
    expect(data.wallet).toEqual(wallet);
    expect(data.params.flags).toBe(INVESTOR_FLAGS.demo);
    expect(data.params.provider).toEqual({ demo: {} });
    expect(Number(data.params.expiresAt)).toBe(kycRecord('demo', 'approve', NOW).expiresAt);

    expect(createAccount.programId).toEqual(ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(createAccount.data).toEqual(Buffer.from([1]));
    expect(createAccount.keys.map((meta) => meta.pubkey)).toEqual([
      faucet.publicKey,
      walletPayment,
      wallet,
      payment.mint,
      SystemProgram.programId,
      TOKEN_2022_PROGRAM_ID,
    ]);
    const minted = decodeMintToInstruction(mintTo, TOKEN_2022_PROGRAM_ID);
    expect(minted.keys.mint.pubkey).toEqual(payment.mint);
    expect(minted.keys.destination.pubkey).toEqual(walletPayment);
    expect(minted.keys.authority.pubkey).toEqual(faucet.publicKey);
    expect(minted.data.amount).toBe(50_000_000_000n);
    expect(SystemInstruction.decodeTransfer(sol)).toEqual({
      fromPubkey: faucet.publicKey,
      toPubkey: wallet,
      lamports: 10_000_000n,
    });

    const { signers, size } = compiled(plan, faucet.publicKey);
    expect(signers).toEqual([faucet.publicKey.toBase58(), demoKyc.publicKey.toBase58()]);
    expect(size).toBeLessThanOrEqual(1232);
  });

  it('leaves an existing record alone and needs only the faucet’s signature', async () => {
    const plan = await accessPlan({
      faucet: faucet.publicKey,
      demoKyc: demoKyc.publicKey,
      wallet,
      payment,
      kyc: null,
      kycRent: 0,
      dripAmount: 1n,
      dripLamports: 1,
    });

    expect(plan.instructions.map((instruction) => instruction.programId.toBase58())).not.toContain(
      PROGRAM_ID.toBase58(),
    );
    expect(compiled(plan, faucet.publicKey).signers).toEqual([faucet.publicKey.toBase58()]);
  });

  it('renews an expired DEMO record without paying rent again', async () => {
    const plan = await accessPlan({
      faucet: faucet.publicKey,
      demoKyc: demoKyc.publicKey,
      wallet,
      payment,
      kyc: kycRecord('demo', 'approve', NOW),
      kycRent: 0,
      dripAmount: 1n,
      dripLamports: 1,
    });

    expect(plan.instructions[0].programId).toEqual(PROGRAM_ID);
    expect(plan.computeUnits).toBe(DEMO_COMPUTE_UNITS.access);
  });
});

describe('desk shares transaction', () => {
  it('opens the wallet’s position at the faucet’s cost and moves shares from the desk', async () => {
    const fleet = await project(FLEET_MINT);
    const plan = await sharesPlan({
      project: fleet,
      desk: desk.publicKey,
      payer: faucet.publicKey,
      wallet,
      shares: 5n,
    });
    const [open, transfer] = body(plan);

    expect(accountMismatches('open_position', open, PROGRAM_ID)).toEqual([]);
    expect(open.keys[0].pubkey).toEqual(faucet.publicKey);
    expect(open.keys[1].pubkey).toEqual(wallet);
    const moved = decodeTransferCheckedInstruction(
      { ...transfer, keys: transfer.keys.slice(0, 4) },
      TOKEN_2022_PROGRAM_ID,
    );
    expect(moved.keys.source.pubkey).toEqual(shareAccountAddress(desk.publicKey, fleet.shareMint));
    expect(moved.keys.destination.pubkey).toEqual(shareAccountAddress(wallet, fleet.shareMint));
    expect(moved.keys.owner.pubkey).toEqual(desk.publicKey);
    expect(moved.data.amount).toBe(5n);
    expect(transfer.keys).toHaveLength(12);

    const { signers, size } = compiled(plan, faucet.publicKey);
    expect(signers).toEqual([faucet.publicKey.toBase58(), desk.publicKey.toBase58()]);
    expect(size).toBeLessThanOrEqual(1232);
  });
});

describe('simulated month transaction', () => {
  it('funds the operator and deposits with the oracle’s co-signature', async () => {
    const fleet = await project(FLEET_MINT);
    const treasury = Keypair.generate().publicKey;
    const operatorPayment = getAssociatedTokenAddressSync(
      fleet.paymentMint,
      operator.publicKey,
      true,
      fleet.paymentTokenProgram,
    );
    const plan = await simulateMonthPlan({
      project: fleet,
      faucet: faucet.publicKey,
      treasury,
      gross: 900_000_000n,
      period: { periodStart: 20270101, periodEnd: 20270131 },
      reportHash: 'ab'.repeat(32),
      periodRent: 2_324_640,
    });
    const [rent, createAccount, mintTo, deposit] = body(plan);

    expect(SystemInstruction.decodeTransfer(rent)).toEqual({
      fromPubkey: faucet.publicKey,
      toPubkey: operator.publicKey,
      lamports: 2_324_640n,
    });
    expect(createAccount.keys[1].pubkey).toEqual(operatorPayment);
    const minted = decodeMintToInstruction(mintTo, fleet.paymentTokenProgram);
    expect(minted.keys.destination.pubkey).toEqual(operatorPayment);
    expect(minted.data.amount).toBe(900_000_000n);
    expect(accountMismatches('deposit_revenue', deposit, PROGRAM_ID, { project: fleet })).toEqual(
      [],
    );
    const { data } = anchorArgs(deposit) as { data: { params: Record<string, unknown> } };
    expect(data.params.periodStart).toBe(20270101);
    expect(data.params.periodEnd).toBe(20270131);
    expect(Buffer.from(data.params.reportHash as number[]).toString('hex')).toBe('ab'.repeat(32));
    expect(data.params.kind).toEqual({ regular: {} });

    const { signers, size } = compiled(plan, faucet.publicKey);
    // The faucet pays the fee, so it signs first; the operator and the oracle co-sign.
    expect(signers[0]).toBe(faucet.publicKey.toBase58());
    expect([...signers].sort()).toEqual(
      [faucet, operator, oracle].map((role) => role.publicKey.toBase58()).sort(),
    );
    expect(size).toBeLessThanOrEqual(1232);
  });
});

describe('Blink transactions', () => {
  it('buy at the raise’s own price, paid and signed by the reader only', async () => {
    const raise = await project(RAISE_MINT);
    const plan = await investPlan({ project: raise, owner: wallet, shares: 3n });
    const [buy] = body(plan);

    expect(accountMismatches('buy_shares', buy, PROGRAM_ID, { project: raise })).toEqual([]);
    expect(buy.keys[0].pubkey).toEqual(wallet);
    expect(buy.keys[1].pubkey).toEqual(wallet);
    const { data } = anchorArgs(buy) as { data: { shares: unknown; maxTotalCost: unknown } };
    expect(String(data.shares)).toBe('3');
    expect(String(data.maxTotalCost)).toBe((3n * raise.pricePerShare).toString());

    const wire = Transaction.from(
      Buffer.from(serializeUnsigned(unsignedTransaction(plan, wallet, BLOCKHASH)), 'base64'),
    );
    expect(wire.feePayer).toEqual(wallet);
    expect(wire.recentBlockhash).toBe(BLOCKHASH);
    expect(wire.signatures.map((entry) => [entry.publicKey.toBase58(), entry.signature])).toEqual([
      [wallet.toBase58(), null],
    ]);
  });

  it('claim to the reader’s own account', async () => {
    const fleet = await project(FLEET_MINT);
    const [claim] = body(await claimPlan({ project: fleet, owner: wallet }));

    expect(accountMismatches('claim', claim, PROGRAM_ID, { project: fleet })).toEqual([]);
    expect(claim.keys[0].pubkey).toEqual(wallet);
    expect(claim.keys[1].pubkey).toEqual(wallet);
  });
});
