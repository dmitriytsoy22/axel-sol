import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Transaction, type PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { fixture, FixtureNode, fixtureProject, key } from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { InvestModal } from '../InvestModal';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// The raise of the fixture: 12 of 100 shares sold at 10 000 tKZT; its buyer holds 880 000 tKZT.
const buyer = key(fixture.projects.fundraising.holders[0]);

async function renderModal(wallet: PublicKey, node = new FixtureNode()) {
  const project = await fixtureProject('fundraising', node);
  const sent: Transaction[] = [];
  const onPurchased = vi.fn();
  render(
    <AppProviders
      connection={node}
      wallet={testWallet(wallet, {
        sendTransaction: async (transaction) => {
          if (!(transaction instanceof Transaction))
            throw new Error('Expected a legacy transaction');
          sent.push(transaction);
          return '5igPsignature';
        },
      })}
    >
      <InvestModal isOpen onClose={vi.fn()} project={project} onPurchased={onPurchased} />
    </AppProviders>,
  );
  return { node, sent, onPurchased };
}

const sharesInput = () => screen.getByLabelText('Number of shares');
const confirmButton = () => screen.getByRole('button', { name: 'Confirm purchase' });

describe('InvestModal', () => {
  it("names the purchase and reads the wallet's payment token balance", async () => {
    await renderModal(buyer);

    expect(screen.getByRole('dialog', { name: 'Buy shares' })).toBeInTheDocument();
    expect(screen.getByText('Hyundai Accent 2023')).toBeInTheDocument();
    expect(await screen.findByText('Balance: 880,000 tKZT')).toBeInTheDocument();
    expect(screen.getByText('88 shares')).toBeInTheDocument();
  });

  it('prices the shares typed in the payment token', async () => {
    await renderModal(buyer);
    await userEvent.type(sharesInput(), '10');

    expect(screen.getByText('You pay').nextSibling).toHaveTextContent('100,000 tKZT');
  });

  it.each([
    ['more shares than are left', '89', 'Only 88 shares are left.'],
    ['a part of a share', '1.5', 'Enter a whole number of shares.'],
  ])('refuses %s before anything is signed', async (_case, typed, message) => {
    await renderModal(buyer);
    await userEvent.type(sharesInput(), typed);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(confirmButton()).toBeDisabled();
  });

  it('refuses a purchase the wallet cannot pay for', async () => {
    await renderModal(key(fixture.stranger));
    await screen.findByText('Balance: 0 tKZT');
    await userEvent.type(sharesInput(), '1');

    expect(screen.getByRole('alert')).toHaveTextContent('Not enough tKZT in this wallet.');
    expect(confirmButton()).toBeDisabled();
  });

  it('sends buy_shares for exactly the shown cost and confirms the purchase', async () => {
    const { sent, onPurchased } = await renderModal(buyer);
    await screen.findByText('Balance: 880,000 tKZT');
    await userEvent.type(sharesInput(), '10');
    await userEvent.click(confirmButton());

    expect(await screen.findByText('Confirmed on Solana')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your portfolio' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(onPurchased).toHaveBeenCalledTimes(1);

    const u64 = (value: bigint) => {
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(value);
      return bytes;
    };
    const buy = sent[0].instructions.find((instruction) =>
      instruction.programId.equals(PROGRAM_ID),
    );
    expect(buy?.data).toEqual(
      Buffer.concat([instructionDiscriminator('buy_shares'), u64(10n), u64(100_000_000_000n)]),
    );
    expect(buy?.keys[1].pubkey.equals(buyer)).toBe(true);
  });

  it("explains a purchase the program rejected, in the program's words", async () => {
    const node = new FixtureNode();
    node.outcome = { InstructionError: [1, { Custom: 6027 }] };
    await renderModal(buyer, node);
    await screen.findByText('Balance: 880,000 tKZT');
    await userEvent.type(sharesInput(), '10');
    await userEvent.click(confirmButton());

    const alerts = await screen.findAllByText('The raise deadline has passed.');
    // Once in the dialog, once in the toast that also links the transaction.
    expect(alerts).toHaveLength(2);
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'The raise deadline has passed.',
    );
  });
});
