// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createTransferCheckedWithTransferHookInstruction,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import { decodeProject } from '../accounts';
import { PROGRAM_ID } from '../connection';
import {
  activateProjectInstruction,
  buySharesInstruction,
  claimInstruction,
  closePositionInstruction,
  depositRevenueInstruction,
  finalizeRaiseInstruction,
  manageProjectInstruction,
  openPositionInstruction,
  refundInstruction,
  setInvestorInstruction,
  setProjectRolesInstruction,
  transferSharesInstruction,
} from '../instructions';
import { projectAddress, shareAccountAddress } from '../pda';
import { accountData, fixture, FixtureConnection, key } from './fixtures/chain';
import { accountMismatches, instructionDiscriminator } from './fixtures/idl';

function project(state: keyof typeof fixture.projects) {
  const address = projectAddress(key(fixture.projects[state].shareMint));
  return decodeProject(address, accountData(address));
}

const operating = project('operating');
const fundraising = project('fundraising');
const failed = project('failed');
const [alice, bob] = fixture.projects.operating.holders.map(key);
const sponsor = key(fixture.operator);

const u64 = (value: bigint) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
};
const u32 = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
};

function expectMatchesIdl(
  name: string,
  instruction: TransactionInstruction,
  seedProject = operating,
  args: Record<string, PublicKey> = {},
) {
  expect(instruction.programId.equals(PROGRAM_ID)).toBe(true);
  expect(instruction.data.subarray(0, 8)).toEqual(instructionDiscriminator(name));
  expect(accountMismatches(name, instruction, PROGRAM_ID, { project: seedProject, args })).toEqual(
    [],
  );
}

describe('investor instructions', () => {
  it('buy_shares pays from the owner and lets a sponsor cover the rent', async () => {
    const instruction = await buySharesInstruction({
      project: fundraising,
      owner: alice,
      payer: sponsor,
      shares: 3n,
      maxTotalCost: 30_000_000_000n,
    });

    expectMatchesIdl('buy_shares', instruction, fundraising);
    expect(instruction.keys[0].pubkey.equals(sponsor)).toBe(true);
    expect(instruction.keys[1].pubkey.equals(alice)).toBe(true);
    expect(instruction.data).toEqual(
      Buffer.concat([instructionDiscriminator('buy_shares'), u64(3n), u64(30_000_000_000n)]),
    );
  });

  it('buy_shares makes the owner pay its own rent by default', async () => {
    const instruction = await buySharesInstruction({
      project: fundraising,
      owner: alice,
      shares: 1n,
      maxTotalCost: 1n,
    });

    expect(instruction.keys[0].pubkey.equals(alice)).toBe(true);
  });

  it('refund returns the payment to the owner of a failed raise', async () => {
    const instruction = await refundInstruction({ project: failed, owner: bob });

    expectMatchesIdl('refund', instruction, failed);
    expect(instruction.data).toEqual(instructionDiscriminator('refund'));
  });

  it('claim can be triggered by anyone for the owner', async () => {
    const instruction = await claimInstruction({
      project: operating,
      owner: alice,
      claimer: sponsor,
    });

    expectMatchesIdl('claim', instruction);
    expect(instruction.keys[1].pubkey.equals(alice)).toBe(true);
  });

  it('open_position onboards a recipient that does not sign', async () => {
    const instruction = await openPositionInstruction({
      project: operating,
      owner: bob,
      payer: alice,
    });

    expectMatchesIdl('open_position', instruction);
  });

  it("close_position closes the owner's empty position", async () => {
    const instruction = await closePositionInstruction({ project: operating, owner: bob });

    expectMatchesIdl('close_position', instruction);
  });
});

describe('share transfers', () => {
  it('list the hook accounts exactly as a wallet resolves them from the chain', async () => {
    const explicit = transferSharesInstruction({
      project: operating,
      from: alice,
      to: bob,
      shares: 2n,
    });
    const resolved = await createTransferCheckedWithTransferHookInstruction(
      new FixtureConnection(),
      shareAccountAddress(alice, operating.shareMint),
      operating.shareMint,
      shareAccountAddress(bob, operating.shareMint),
      alice,
      2n,
      0,
      [],
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    );

    const metas = (instruction: TransactionInstruction) =>
      instruction.keys.map(({ pubkey, isSigner, isWritable }) => [
        pubkey.toBase58(),
        isSigner,
        isWritable,
      ]);
    // Four transfer accounts, six extra accounts, the hook program and the validation account.
    expect(explicit.keys).toHaveLength(12);
    expect(metas(explicit)).toEqual(metas(resolved));
    expect(explicit.data).toEqual(resolved.data);
    expect(explicit.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it('move whole shares with transfer_checked', () => {
    const instruction = transferSharesInstruction({
      project: operating,
      from: alice,
      to: bob,
      shares: 7n,
    });

    // TransferChecked is instruction 12 of the token program; shares have 0 decimals.
    expect(instruction.data).toEqual(Buffer.concat([Buffer.from([12]), u64(7n), Buffer.from([0])]));
  });
});

describe('admin and permissionless instructions', () => {
  const admin = key(fixture.admin);

  it('finalize_raise needs only the project', async () => {
    const instruction = await finalizeRaiseInstruction({ project: fundraising });

    expectMatchesIdl('finalize_raise', instruction, fundraising);
  });

  it.each([
    ['cancelRaise', 'cancel_raise'],
    ['pauseProject', 'pause_project'],
    ['resumeProject', 'resume_project'],
    ['closeProject', 'close_project'],
  ] as const)('%s is signed by the admin', async (action, name) => {
    const instruction = await manageProjectInstruction({ action, project: operating, admin });

    expectMatchesIdl(name, instruction);
    expect(instruction.keys[0].pubkey.equals(admin)).toBe(true);
  });

  it('set_project_roles encodes a kept role as None', async () => {
    const operator = PublicKey.unique();
    const instruction = await setProjectRolesInstruction({
      project: operating,
      admin,
      operator,
      oracle: null,
    });

    expectMatchesIdl('set_project_roles', instruction);
    expect(instruction.data).toEqual(
      Buffer.concat([
        instructionDiscriminator('set_project_roles'),
        Buffer.from([1]),
        operator.toBuffer(),
        Buffer.from([0]),
      ]),
    );
  });

  it('activate_project pays the canonical treasury and operator accounts', async () => {
    const docHash = 'ab'.repeat(32);
    const instruction = await activateProjectInstruction({
      project: fundraising,
      admin,
      treasury: PublicKey.unique(),
      acquisitionDocHash: docHash,
    });

    expectMatchesIdl('activate_project', instruction, fundraising);
    expect(instruction.data).toEqual(
      Buffer.concat([instructionDiscriminator('activate_project'), Buffer.from(docHash, 'hex')]),
    );
  });

  it('refuses a document hash that is not 32 bytes', () => {
    expect(() =>
      activateProjectInstruction({
        project: fundraising,
        admin,
        treasury: PublicKey.unique(),
        acquisitionDocHash: 'abc',
      }),
    ).toThrow('Expected a 32-byte hash as 64 hex characters');
  });

  it('deposit_revenue opens the next period and is co-signed by the oracle', async () => {
    const reportHash = '0f'.repeat(32);
    const instruction = await depositRevenueInstruction({
      project: operating,
      operator: operating.operator,
      oracle: operating.oracle,
      treasury: PublicKey.unique(),
      gross: 1_500_000n,
      periodStart: 20270101,
      periodEnd: 20270131,
      reportHash,
      kind: 'final',
    });

    expectMatchesIdl('deposit_revenue', instruction);
    expect(instruction.data).toEqual(
      Buffer.concat([
        instructionDiscriminator('deposit_revenue'),
        u64(1_500_000n),
        u32(20270101),
        u32(20270131),
        Buffer.from(reportHash, 'hex'),
        Buffer.from([1]),
      ]),
    );
  });

  it('set_investor writes the record of the wallet it names', async () => {
    const authority = key(fixture.kycAuthority);
    const wallet = PublicKey.unique();
    const instruction = await setInvestorInstruction({
      authority,
      wallet,
      status: 'active',
      expiresAt: 1_800_000_000,
      jurisdiction: 398,
      flags: 1,
      provider: 'demo',
    });

    expectMatchesIdl('set_investor', instruction, operating, { wallet });
    const expiresAt = Buffer.alloc(8);
    expiresAt.writeBigInt64LE(1_800_000_000n);
    const jurisdiction = Buffer.alloc(2);
    jurisdiction.writeUInt16LE(398);
    expect(instruction.data).toEqual(
      Buffer.concat([
        instructionDiscriminator('set_investor'),
        wallet.toBuffer(),
        Buffer.from([1]),
        expiresAt,
        jurisdiction,
        Buffer.from([1, 2]),
      ]),
    );
  });
});
