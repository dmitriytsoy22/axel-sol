import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicKey, Transaction, type TransactionSignature } from '@solana/web3.js';
import AdminPage from '@/app/[locale]/admin/page';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { configAddress } from '@/lib/solana/pda';
import { fixture, FixtureNode, key } from '@/lib/solana/__tests__/fixtures/chain';
import { patchProgramAccount } from '@/lib/solana/__tests__/fixtures/accountPatch';
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

function renderConsole(wallet: PublicKey, node = new FixtureNode()) {
  const sent: Transaction[] = [];
  render(
    <AppProviders
      connection={node}
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

    expect(await screen.findByRole('heading', { name: 'Income deposits' })).toBeInTheDocument();
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Deposits open')).toBeInTheDocument();
    // No oracle backend is configured in the tests, so the monthly deposit says why it is off.
    expect(screen.getByRole('heading', { name: "Deposit a month's income" })).toBeInTheDocument();
    expect(screen.getByText(/This deployment has no oracle backend/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Car status' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
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

  it('splits the console by role for a wallet that holds several keys', async () => {
    const admin = key(fixture.admin);
    // The admin key doubling as the KYC key, as it may on a small devnet deployment.
    const accounts = await patchProgramAccount('config', configAddress(), (config) => ({
      ...config,
      kycAuthority: admin,
    }));
    renderConsole(admin, new FixtureNode(accounts));

    const tabs = await screen.findByRole('tablist', { name: 'Your roles' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Platform admin', 'KYC']);
    expect(screen.getByRole('tab', { name: 'Platform admin' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Protocol config' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'KYC' }));

    expect(screen.getByRole('tabpanel')).toHaveTextContent('KYC registry');
    expect(screen.queryByRole('heading', { name: 'Protocol config' })).not.toBeInTheDocument();
  });

  it('shows the platform admin the protocol config as the program holds it', async () => {
    renderConsole(key(fixture.admin));

    const config = within(
      (await screen.findByRole('heading', { name: 'Protocol config' })).closest('section')!,
    );
    expect(config.getByText('Protocol').nextSibling).toHaveTextContent('Running');
    expect(config.getByText('Recovery veto window').nextSibling).toHaveTextContent(
      /\d+ (hour|day)s?/,
    );
    expect(config.getByText('Admin').nextSibling).toHaveTextContent(fixture.admin.slice(0, 4));
  });

  it('looks the wallet up in the registry before the KYC key writes it', async () => {
    renderConsole(key(fixture.kycAuthority));
    const holder = fixture.projects.operating.holders[0];

    await userEvent.type(await screen.findByLabelText('Wallet address'), holder);

    const record = within(
      (await screen.findByRole('heading', { name: 'Current record on Solana' })).parentElement!,
    );
    expect(await record.findByText('Active')).toBeInTheDocument();
    expect(record.getByText('Verified by').nextSibling).toHaveTextContent('Sumsub');
  });

  it('refuses to let the admin move a car to an operator that is also its oracle', async () => {
    renderConsole(key(fixture.admin));
    const form = within(
      (await screen.findByRole('heading', { name: 'Operator and oracle' })).closest('section')!,
    );
    const shared = PublicKey.unique().toBase58();

    await userEvent.type(form.getByLabelText('New operator wallet'), shared);
    await userEvent.type(form.getByLabelText('New oracle key'), shared);

    expect(form.getByRole('alert')).toHaveTextContent(
      'The operator and the oracle must be different keys',
    );
    expect(form.getByRole('button', { name: 'Update roles' })).toBeDisabled();
  });

  it('proposes a share recovery with the case file hash for the selected car', async () => {
    const sent = renderConsole(key(fixture.admin));
    const form = within(
      (await screen.findByRole('heading', { name: 'Share recovery' })).closest('section')!,
    );
    const lost = key(fixture.projects.operating.holders[1]);
    const next = PublicKey.unique();

    await userEvent.type(form.getByLabelText('Lost wallet'), lost.toBase58());
    await userEvent.type(form.getByLabelText('New wallet'), next.toBase58());
    await userEvent.type(form.getByLabelText('Shares to move'), '3');
    await userEvent.type(form.getByLabelText('SHA-256 of the case file'), 'ab'.repeat(32));
    await userEvent.click(form.getByRole('button', { name: 'Propose the recovery' }));

    expect(await screen.findByText('Recovery proposed')).toBeInTheDocument();
    const propose = sent[0].instructions.find(({ programId }) => programId.equals(PROGRAM_ID));
    expect(propose?.data.subarray(0, 8)).toEqual(instructionDiscriminator('propose_recovery'));
    expect(propose?.data.readBigUInt64LE(8)).toBe(3n);
    expect(propose?.data.subarray(16, 48)).toEqual(Buffer.from('ab'.repeat(32), 'hex'));
    expect(propose?.keys[3].pubkey.equals(lost)).toBe(true);
    expect(propose?.keys[6].pubkey.equals(next)).toBe(true);
  });

  it('stops the demo key before a full verification it may not change', async () => {
    const demoKey = PublicKey.unique();
    const accounts = await patchProgramAccount('config', configAddress(), (config) => ({
      ...config,
      demoKycAuthority: demoKey,
    }));
    renderConsole(demoKey, new FixtureNode(accounts));

    await userEvent.type(
      await screen.findByLabelText('Wallet address'),
      fixture.projects.operating.holders[0],
    );

    expect(
      await screen.findByText(
        'This is a full verification. The demo key can only change demo access.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  });
});
