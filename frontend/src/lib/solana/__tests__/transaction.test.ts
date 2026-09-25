// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  PACKET_DATA_SIZE,
  PublicKey,
  type Transaction,
} from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { decodeProject, type ProjectAccount } from '../accounts';
import {
  buySharesInstruction,
  claimInstruction,
  openPositionInstruction,
  transferSharesInstruction,
} from '../instructions';
import { escrowAddress, projectAddress, revenueAddress } from '../pda';
import { buildTransaction, chunk, COMPUTE_UNITS, MAX_CLAIMS_PER_TRANSACTION } from '../transaction';
import { accountData, fixture, key } from './fixtures/chain';

const owner = key(fixture.projects.operating.holders[0]);
const recipient = key(fixture.projects.operating.holders[1]);
const testTenge = key(fixture.paymentMint);

/** A project of its own share mint that pays in `paymentMint`, the test tenge by default. */
function anotherProject(paymentMint = testTenge): ProjectAccount {
  const address = projectAddress(key(fixture.projects.operating.shareMint));
  const template = decodeProject(address, accountData(address));
  const shareMint = PublicKey.unique();
  const project = projectAddress(shareMint);
  return {
    ...template,
    address: project,
    shareMint,
    paymentMint,
    paymentTokenProgram: TOKEN_2022_PROGRAM_ID,
    escrowVault: escrowAddress(project),
    revenueVault: revenueAddress(project),
  };
}

/** Wire size once signed: the signature count, one signature per signer, the message. */
function wireSize(transaction: Transaction): number {
  transaction.feePayer = owner;
  transaction.recentBlockhash = PublicKey.unique().toBase58();
  const message = transaction.compileMessage();
  return 1 + 64 * message.header.numRequiredSignatures + message.serialize().length;
}

/** Claims from `projects` cars that each pay in a token of their own, the largest case. */
async function claimAll(projects: number): Promise<number> {
  const instructions = await Promise.all(
    Array.from({ length: projects }, () =>
      claimInstruction({ project: anotherProject(PublicKey.unique()), owner }),
    ),
  );
  return wireSize(buildTransaction(instructions, COMPUTE_UNITS.claimPerProject * projects));
}

describe('transactions', () => {
  it('start with their compute unit limit', () => {
    const transaction = buildTransaction(
      [
        transferSharesInstruction({
          project: anotherProject(),
          from: owner,
          to: recipient,
          shares: 1n,
        }),
      ],
      COMPUTE_UNITS.transfer,
    );

    const [budget] = transaction.instructions;
    expect(budget.programId.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(ComputeBudgetInstruction.decodeSetComputeUnitLimit(budget).units).toBe(100_000);
  });

  it('fit as many claims as MAX_CLAIMS_PER_TRANSACTION and no more', async () => {
    expect(await claimAll(MAX_CLAIMS_PER_TRANSACTION)).toBeLessThanOrEqual(PACKET_DATA_SIZE);
    expect(await claimAll(MAX_CLAIMS_PER_TRANSACTION + 1)).toBeGreaterThan(PACKET_DATA_SIZE);
  });

  it('fit a purchase that also creates the position and share account', async () => {
    const instruction = await buySharesInstruction({
      project: anotherProject(),
      owner,
      shares: 1n,
      maxTotalCost: 1n,
    });

    expect(wireSize(buildTransaction([instruction], COMPUTE_UNITS.buy))).toBeLessThanOrEqual(
      PACKET_DATA_SIZE,
    );
  });

  it('fit onboarding a recipient together with the transfer', async () => {
    const project = anotherProject();
    const transaction = buildTransaction(
      [
        await openPositionInstruction({ project, owner: recipient, payer: owner }),
        transferSharesInstruction({ project, from: owner, to: recipient, shares: 1n }),
      ],
      COMPUTE_UNITS.openPositionAndTransfer,
    );

    expect(wireSize(transaction)).toBeLessThanOrEqual(PACKET_DATA_SIZE);
  });
});

describe('chunk', () => {
  it('splits into groups of at most the given size, in order', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9]]);
    expect(chunk([], 4)).toEqual([]);
  });
});
