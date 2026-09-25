import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicKey, Transaction, type TransactionSignature } from '@solana/web3.js';
import AdminPage from '@/app/[locale]/admin/page';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { fixture, FixtureNode, key } from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderConsole(wallet: PublicKey) {
  const sent: Transaction[] = [];
  render(
    <AppProviders
      connection={new FixtureNode()}
      wallet={testWallet(wallet, {
        sendTransaction: async (transaction): Promise<TransactionSignature> => {
          if (!(transaction instanceof Transaction))
            throw new Error('Expected a legacy transaction');
          sent.push(transaction);
          return 'signature';
        },
      })}
    >
      <AdminPage />
    </AppProviders>,
  );
  return sent;
}

describe('Admin console', () => {
  it('gives the admin every car, with a switch between them', async () => {
    renderConsole(key(fixture.admin));

    const cars = await screen.findByLabelText('Car');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Kia Rio · AXKR017',
      'Hyundai Accent · AXHA003',
      'Chevrolet Onix · AXCO009',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Car status' })).toBeInTheDocument();

    await userEvent.selectOptions(
      cars,
      screen.getByRole('option', { name: 'Chevrolet Onix · AXCO009' }),
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chevrolet Onix 2024');
    expect(screen.getByText(/This raise failed/)).toBeInTheDocument();
  });

  it("shows the operator its cars and explains deposits, without the admin's controls", async () => {
    renderConsole(key(fixture.operator));

    expect(
      await screen.findByRole('heading', { name: 'You operate this car' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Car status' })).not.toBeInTheDocument();
  });

  it('lets the KYC key approve a wallet in the registry', async () => {
    const sent = renderConsole(key(fixture.kycAuthority));
    const wallet = PublicKey.unique();

    await userEvent.type(await screen.findByLabelText('Wallet address'), wallet.toBase58());
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Wallet approved')).toBeInTheDocument();
    const setInvestor = sent[0].instructions.find(({ programId }) => programId.equals(PROGRAM_ID));
    expect(setInvestor?.data.subarray(0, 8)).toEqual(instructionDiscriminator('set_investor'));
    // The record is for the wallet typed in, signed by the KYC key.
    expect(setInvestor?.data.subarray(8, 40)).toEqual(wallet.toBuffer());
    expect(setInvestor?.keys[0].pubkey.toBase58()).toBe(fixture.kycAuthority);
  });

  it('keeps the console closed to a wallet with no role', async () => {
    renderConsole(key(fixture.stranger));

    expect(
      await screen.findByRole('heading', { name: 'This wallet has no role here' }),
    ).toBeInTheDocument();
  });
});
