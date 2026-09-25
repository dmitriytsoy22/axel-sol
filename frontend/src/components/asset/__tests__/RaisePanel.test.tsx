import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicKey, Transaction, type TransactionSignature } from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { escrowAddress, projectAddress } from '@/lib/solana/pda';
import {
  fixture,
  FixtureConnection,
  FixtureNode,
  fixtureProject,
  key,
  type FixtureAccount,
} from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { EscrowBalance } from '../EscrowBalance';
import { InvestPanel } from '../InvestPanel';
import { RaiseProgress } from '../RaiseProgress';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));

const raiseEscrow = escrowAddress(projectAddress(key(fixture.projects.fundraising.shareMint)));

function withEscrowAmount(amount: bigint): FixtureAccount[] {
  return fixture.accounts.map((account) => {
    if (account.address !== raiseEscrow.toBase58()) return account;
    const data = Buffer.from(account.data, 'base64');
    data.writeBigUInt64LE(amount, 64);
    return { ...account, data: data.toString('base64') };
  });
}

describe('RaiseProgress', () => {
  it('marks the soft cap on the bar and says in words whether the goal is met', () => {
    const { rerender } = render(
      <AppProviders connection={new FixtureConnection()} wallet={testWallet(null)}>
        <RaiseProgress project={{ sharesSold: 40n, totalShares: 200n, softCapShares: 150n }} />
      </AppProviders>,
    );
    expect(screen.getByTestId('soft-cap-marker')).toHaveStyle('left: 75%');
    expect(screen.getByText('Goal: 150')).toBeInTheDocument();

    rerender(
      <AppProviders connection={new FixtureConnection()} wallet={testWallet(null)}>
        <RaiseProgress project={{ sharesSold: 150n, totalShares: 200n, softCapShares: 150n }} />
      </AppProviders>,
    );
    expect(screen.getByText('Goal of 150 met')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '150 of 200 shares sold. The goal of 150 is met.',
    );
  });
});

describe('EscrowBalance', () => {
  it("reads the raise escrow's balance and shows it covers every share sold", async () => {
    const connection = new FixtureConnection();
    const project = await fixtureProject('fundraising', connection);
    render(
      <AppProviders connection={connection} wallet={testWallet(null)}>
        <EscrowBalance project={project} />
      </AppProviders>,
    );

    // 12 shares sold at 10 000 tKZT.
    expect(await screen.findByText('120,000 tKZT')).toBeInTheDocument();
    expect(
      screen.getByText('12 × 10,000 tKZT per share: exactly what buyers paid'),
    ).toBeInTheDocument();
  });

  it('says so when the escrow holds less than the buyers paid in', async () => {
    const connection = new FixtureConnection(withEscrowAmount(119_999_000_000n));
    const project = await fixtureProject('fundraising', connection);
    render(
      <AppProviders connection={connection} wallet={testWallet(null)}>
        <EscrowBalance project={project} />
      </AppProviders>,
    );

    expect(
      await screen.findByText('Less than the 120,000 tKZT buyers paid in'),
    ).toBeInTheDocument();
  });
});

describe('InvestPanel', () => {
  it('lets any connected wallet settle a raise that reached its goal and ran out of time', async () => {
    const sent: Transaction[] = [];
    const project = makeProject({
      sharesSold: 70n,
      softCapShares: 60n,
      raiseDeadline: 1_700_000_000,
    });
    const onChanged = vi.fn();
    render(
      <AppProviders
        connection={new FixtureNode()}
        wallet={testWallet(PublicKey.unique(), {
          sendTransaction: async (transaction): Promise<TransactionSignature> => {
            if (!(transaction instanceof Transaction))
              throw new Error('Expected a legacy transaction');
            sent.push(transaction);
            return 'signature';
          },
        })}
      >
        <InvestPanel
          project={project}
          saleState="ended"
          approval="eligible"
          position={null}
          now={1_800_000_000}
          onBuy={vi.fn()}
          onChanged={onChanged}
        />
      </AppProviders>,
    );

    expect(screen.getByText(/settling marks it funded/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Settle the raise' }));

    expect(await screen.findByText('Raise settled')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
    const settle = sent[0].instructions.find(({ programId }) => programId.equals(PROGRAM_ID));
    expect(settle?.data).toEqual(instructionDiscriminator('finalize_raise'));
  });
});
