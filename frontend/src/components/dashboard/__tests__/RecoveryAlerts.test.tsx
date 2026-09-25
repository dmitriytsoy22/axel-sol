import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BN from 'bn.js';
import { describe, expect, it, vi } from 'vitest';
import { PublicKey, Transaction, type TransactionSignature } from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { projectAddress, recoveryAddress } from '@/lib/solana/pda';
import { fixture, FixtureNode, fixtureProject, key } from '@/lib/solana/__tests__/fixtures/chain';
import { addProgramAccount } from '@/lib/solana/__tests__/fixtures/accountPatch';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { RecoveryAlerts } from '../RecoveryAlerts';

const alice = key(fixture.projects.operating.holders[0]);
const newWallet = PublicKey.unique();
const project = projectAddress(key(fixture.projects.operating.shareMint));
const request = recoveryAddress(project, alice);
const now = () => Math.floor(Date.now() / 1000);

/** A node whose chain holds a recovery of Alice's shares that runs from `eta`. */
async function nodeWithRecovery(eta: number) {
  const accounts = await addProgramAccount('recoveryRequest', request, {
    project,
    fromOwner: alice,
    toOwner: newWallet,
    shares: new BN(12),
    reasonHash: Array.from({ length: 32 }, (_, i) => i + 1),
    proposer: key(fixture.admin),
    proposedAt: new BN(eta - 3_600),
    eta: new BN(eta),
    bump: 255,
  });
  return new FixtureNode(accounts);
}

async function renderAlerts(node: FixtureNode) {
  const sent: Transaction[] = [];
  const car = await fixtureProject('operating', node);
  render(
    <AppProviders
      connection={node}
      wallet={testWallet(alice, {
        sendTransaction: async (transaction): Promise<TransactionSignature> => {
          if (!(transaction instanceof Transaction))
            throw new Error('Expected a legacy transaction');
          sent.push(transaction);
          return 'signature';
        },
      })}
    >
      <RecoveryAlerts projects={[car]} onChanged={vi.fn()} />
    </AppProviders>,
  );
  return sent;
}

describe('RecoveryAlerts', () => {
  it('warns the holder of a pending recovery of its shares and lets it veto before it can run', async () => {
    const sent = await renderAlerts(await nodeWithRecovery(now() + 3_600));

    expect(await screen.findByText('A recovery of your shares is pending')).toBeInTheDocument();
    expect(screen.getByText(/moving 12 shares of Kia Rio from this wallet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Veto the recovery' }));

    expect(await screen.findByText('Recovery cancelled')).toBeInTheDocument();
    const veto = sent[0].instructions.find(({ programId }) => programId.equals(PROGRAM_ID));
    expect(veto?.data).toEqual(instructionDiscriminator('cancel_recovery'));
    expect(veto?.keys[0].pubkey.equals(alice)).toBe(true);
    expect(veto?.keys[2].pubkey.equals(request)).toBe(true);
  });

  it('says the veto window has closed once the recovery can run', async () => {
    await renderAlerts(await nodeWithRecovery(now() - 60));

    expect(await screen.findByText(/The veto window closed on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Veto the recovery' })).not.toBeInTheDocument();
  });

  it('shows nothing when no recovery of this wallet is pending', async () => {
    const node = new FixtureNode();
    await renderAlerts(node);

    await vi.waitFor(() => expect(node.scans).toBe(1));
    expect(screen.queryByText('A recovery of your shares is pending')).not.toBeInTheDocument();
  });
});
