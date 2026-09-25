import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import {
  ComputeBudgetInstruction,
  Transaction,
  type PublicKey,
  type TransactionSignature,
} from '@solana/web3.js';
import { decodePosition } from '@/lib/solana/accounts';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { pendingRevenue } from '@/lib/solana/math';
import { positionAddress } from '@/lib/solana/pda';
import {
  accountData,
  fixture,
  FixtureNode,
  fixtureProject,
  key,
} from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import type { Holding } from '@/hooks/usePositions';
import { TransferModal } from '../TransferModal';

const [alice, bob] = fixture.projects.operating.holders.map(key);
// Verified, but never held a share of the operating car.
const verifiedNewcomer = key(fixture.projects.fundraising.holders[0]);
const stranger = key(fixture.stranger);

async function alicesHolding(): Promise<Holding> {
  const project = await fixtureProject('operating');
  const address = positionAddress(project.address, alice);
  const position = decodePosition(address, accountData(address));
  return { project, position, pending: pendingRevenue(position, project.accPerShare) };
}

async function renderModal() {
  const sent: Transaction[] = [];
  const onTransferred = vi.fn();
  const onClose = vi.fn();
  render(
    <AppProviders
      connection={new FixtureNode()}
      wallet={testWallet(alice, {
        sendTransaction: async (transaction): Promise<TransactionSignature> => {
          if (!(transaction instanceof Transaction))
            throw new Error('Expected a legacy transaction');
          sent.push(transaction);
          return 'signature';
        },
      })}
    >
      <TransferModal
        holding={await alicesHolding()}
        onClose={onClose}
        onTransferred={onTransferred}
      />
    </AppProviders>,
  );
  return { sent, onTransferred, onClose };
}

async function fill(recipient: string, shares: string) {
  await userEvent.type(screen.getByLabelText("Recipient's wallet"), recipient);
  await userEvent.type(screen.getByLabelText('Shares to send'), shares);
}

const send = () => screen.getByRole('button', { name: 'Send shares' });
const limit = (transaction: Transaction) =>
  ComputeBudgetInstruction.decodeSetComputeUnitLimit(transaction.instructions[0]).units;

describe('TransferModal', () => {
  it('sends shares to a holder with the hook accounts listed in the transfer itself', async () => {
    const { sent, onTransferred, onClose } = await renderModal();
    await fill(bob.toBase58(), '2');
    await userEvent.click(send());

    expect(await screen.findByText('Shares sent')).toBeInTheDocument();
    expect([onTransferred.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 1]);
    const [transfer] = sent[0].instructions.slice(1);
    expect(sent[0].instructions).toHaveLength(2);
    expect(limit(sent[0])).toBe(100_000);
    expect(transfer.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(transfer.keys.some(({ pubkey }) => pubkey.equals(PROGRAM_ID))).toBe(true);
    expect(transfer.keys).toHaveLength(12);
  });

  it('onboards a verified recipient without a position in the same transaction', async () => {
    const { sent } = await renderModal();
    await fill(verifiedNewcomer.toBase58(), '1');
    await userEvent.click(send());

    expect(await screen.findByText('Shares sent')).toBeInTheDocument();
    const [, open, transfer] = sent[0].instructions;
    expect(open.data).toEqual(instructionDiscriminator('open_position'));
    expect(open.keys[1].pubkey.equals(verifiedNewcomer)).toBe(true);
    expect(transfer.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(limit(sent[0])).toBe(200_000);
  });

  it('stops before signing when the recipient never passed KYC', async () => {
    const { sent, onTransferred } = await renderModal();
    await fill(stranger.toBase58(), '1');
    await userEvent.click(send());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The recipient hasn't passed KYC for this car, so it can't receive shares.",
    );
    expect(screen.getByText('Transfer failed')).toBeInTheDocument();
    expect(sent).toEqual([]);
    expect(onTransferred).not.toHaveBeenCalled();
  });

  it.each<[string, (holder: PublicKey) => string, string, string]>([
    ['a malformed address', () => 'not-an-address', '1', "That isn't a Solana wallet address."],
    ['the sender itself', (holder) => holder.toBase58(), '1', "That's this wallet."],
    ['more shares than held', () => bob.toBase58(), '44', 'More than you hold (43).'],
    ['no shares at all', () => bob.toBase58(), '0', 'Enter a whole number of shares.'],
  ])('refuses %s before anything is sent', async (_case, recipient, shares, message) => {
    const { sent } = await renderModal();
    await fill(recipient(alice), shares);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(send()).toBeDisabled();
    expect(sent).toEqual([]);
  });
});
