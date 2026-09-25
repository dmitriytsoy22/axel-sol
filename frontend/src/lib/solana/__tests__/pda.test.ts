// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from '@solana/spl-token';
import {
  decodeConfig,
  decodeInvestor,
  decodePosition,
  decodeProject,
  decodeRevenuePeriod,
} from '../accounts';
import { PROGRAM_ID } from '../connection';
import {
  configAddress,
  escrowAddress,
  extraAccountMetasAddress,
  investorAddress,
  paymentAccountAddress,
  periodAddress,
  positionAddress,
  projectAddress,
  revenueAddress,
  SEEDS,
  shareAccountAddress,
} from '../pda';
import { accountData, fixture, key } from './fixtures/chain';
import { IDL } from './fixtures/idl';

const idlSeed = (name: string): string => {
  const constant = IDL.constants?.find((entry) => entry.name === name);
  if (!constant) throw new Error(`The IDL has no constant ${name}`);
  return Buffer.from(JSON.parse(constant.value) as number[]).toString();
};

const PROJECTS = Object.values(fixture.projects);

describe('PDA seeds', () => {
  it('are the seed constants the program exports', () => {
    expect(SEEDS).toEqual({
      config: idlSeed('CONFIG_SEED'),
      investor: idlSeed('INVESTOR_SEED'),
      project: idlSeed('PROJECT_SEED'),
      position: idlSeed('POSITION_SEED'),
      period: idlSeed('PERIOD_SEED'),
      escrow: idlSeed('ESCROW_SEED'),
      revenue: idlSeed('REVENUE_SEED'),
      extraAccountMetas: idlSeed('EXTRA_ACCOUNT_METAS_SEED'),
      recovery: idlSeed('RECOVERY_SEED'),
    });
  });

  it('derive under the program the fixture was produced by', () => {
    expect(PROGRAM_ID.toBase58()).toBe(fixture.programId);
  });
});

// The fixture holds accounts the program created at addresses it derived itself.
describe('addresses the program wrote to', () => {
  it('find the config', () => {
    expect(decodeConfig(accountData(configAddress())).admin.toBase58()).toBe(fixture.admin);
  });

  it.each(Object.entries(fixture.projects))(
    'find the %s project and its vaults',
    (_state, entry) => {
      const shareMint = key(entry.shareMint);
      const address = projectAddress(shareMint);
      const project = decodeProject(address, accountData(address));

      expect(project.shareMint.equals(shareMint)).toBe(true);
      expect(project.escrowVault.equals(escrowAddress(address))).toBe(true);
      expect(project.revenueVault.equals(revenueAddress(address))).toBe(true);
      expect(accountData(extraAccountMetasAddress(shareMint)).length).toBeGreaterThan(0);
    },
  );

  it("find every holder's KYC record, position and share account", () => {
    for (const entry of PROJECTS) {
      const shareMint = key(entry.shareMint);
      const project = projectAddress(shareMint);
      for (const holder of entry.holders.map(key)) {
        expect(decodeInvestor(accountData(investorAddress(holder))).wallet.equals(holder)).toBe(
          true,
        );

        const position = decodePosition(
          positionAddress(project, holder),
          accountData(positionAddress(project, holder)),
        );
        expect([position.project.equals(project), position.owner.equals(holder)]).toEqual([
          true,
          true,
        ]);

        const shareAccount = shareAccountAddress(holder, shareMint);
        const token = unpackAccount(
          shareAccount,
          {
            data: accountData(shareAccount),
            owner: TOKEN_2022_PROGRAM_ID,
            lamports: 0,
            executable: false,
          },
          TOKEN_2022_PROGRAM_ID,
        );
        expect([token.owner.equals(holder), token.mint.equals(shareMint)]).toEqual([true, true]);
        expect(token.amount).toBe(position.shares);
      }
    }
  });

  it('find every revenue period by index', () => {
    const project = projectAddress(key(fixture.projects.operating.shareMint));
    const { periodCount } = decodeProject(project, accountData(project));

    const indexes = Array.from(
      { length: periodCount },
      (_, index) =>
        decodeRevenuePeriod(
          periodAddress(project, index),
          accountData(periodAddress(project, index)),
        ).index,
    );

    expect(indexes).toEqual([0, 1, 2]);
  });

  it('find the payment account refunds and claims go to', () => {
    const holder = key(fixture.projects.operating.holders[0]);
    const address = paymentAccountAddress(holder, key(fixture.paymentMint), TOKEN_2022_PROGRAM_ID);
    const token = unpackAccount(
      address,
      { data: accountData(address), owner: TOKEN_2022_PROGRAM_ID, lamports: 0, executable: false },
      TOKEN_2022_PROGRAM_ID,
    );

    expect(token.owner.equals(holder)).toBe(true);
  });
});
