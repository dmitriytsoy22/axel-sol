import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublicKey, Transaction, type TransactionSignature } from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { unixNow } from '@/lib/solana/eligibility';
import { paymentAccountAddress } from '@/lib/solana/pda';
import { FixtureNode } from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import type { Project } from '@/types/project';
import { ProjectControls } from '../ProjectControls';

const admin = PublicKey.unique();
const treasury = PublicKey.unique();
const DAY = 86_400;

function renderControls(project: Project) {
  const sent: Transaction[] = [];
  const onChanged = vi.fn();
  render(
    <AppProviders
      connection={new FixtureNode()}
      wallet={testWallet(admin, {
        sendTransaction: async (transaction): Promise<TransactionSignature> => {
          if (!(transaction instanceof Transaction))
            throw new Error('Expected a legacy transaction');
          sent.push(transaction);
          return 'signature';
        },
      })}
    >
      <ProjectControls project={project} treasury={treasury} onChanged={onChanged} />
    </AppProviders>,
  );
  return { sent, onChanged };
}

/** The axel_v2 instruction of the only transaction sent. */
const sentInstruction = (sent: Transaction[]) => {
  expect(sent).toHaveLength(1);
  const instruction = sent[0].instructions.find(({ programId }) => programId.equals(PROGRAM_ID));
  if (!instruction) throw new Error('The transaction has no axel_v2 instruction');
  return instruction;
};

const buttons = () => screen.queryAllByRole('button').map((button) => button.textContent);

describe('ProjectControls', () => {
  it('asks before closing a car, and sends close_project only once confirmed', async () => {
    const { sent, onChanged } = renderControls(makeProject({ status: 'operating' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close project…' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "Close Toyota Camry for good? This can't be undone.",
    );
    expect(sent).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Close permanently' }));

    expect(await screen.findByText('Project closed')).toBeInTheDocument();
    const close = sentInstruction(sent);
    expect(close.data).toEqual(instructionDiscriminator('close_project'));
    expect(close.keys[0].pubkey.equals(admin)).toBe(true);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('backs out of closing without a transaction', async () => {
    const { sent } = renderControls(makeProject({ status: 'operating' }));

    await userEvent.click(screen.getByRole('button', { name: 'Close project…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['operating', ['Pause', 'Close project…']],
    ['paused', ['Resume', 'Close project…']],
  ] as const)('offers a %s car the actions of its state', (status, expected) => {
    renderControls(makeProject({ status }));

    expect(buttons()).toEqual(expected);
  });

  it('offers a running raise only its cancellation', () => {
    renderControls(makeProject({ status: 'fundraising', raiseDeadline: unixNow() + DAY }));

    expect(buttons()).toEqual(['Cancel raise…']);
  });

  it('offers to settle a raise past its deadline', async () => {
    const { sent } = renderControls(
      makeProject({ status: 'fundraising', raiseDeadline: unixNow() - 60 }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Settle the raise' }));

    expect(await screen.findByText('Raise settled')).toBeInTheDocument();
    expect(sentInstruction(sent).data).toEqual(instructionDiscriminator('finalize_raise'));
  });

  it('releases a funded raise only with the hash of the purchase documents', async () => {
    const project = makeProject({ status: 'funded', activationDeadline: unixNow() + DAY });
    const { sent } = renderControls(project);
    const release = screen.getByRole('button', { name: 'Release to the operator' });

    await userEvent.type(screen.getByLabelText('SHA-256 of the purchase documents'), 'abc');
    expect(release).toBeDisabled();

    const hash = 'c0'.repeat(32);
    await userEvent.clear(screen.getByLabelText('SHA-256 of the purchase documents'));
    await userEvent.type(screen.getByLabelText('SHA-256 of the purchase documents'), hash);
    await userEvent.click(release);

    expect(await screen.findByText('Raise released to the operator')).toBeInTheDocument();
    const activate = sentInstruction(sent);
    expect(activate.data).toEqual(
      Buffer.concat([instructionDiscriminator('activate_project'), Buffer.from(hash, 'hex')]),
    );
    expect(
      activate.keys.some(({ pubkey }) =>
        pubkey.equals(
          paymentAccountAddress(treasury, project.paymentMint, project.paymentTokenProgram),
        ),
      ),
    ).toBe(true);
  });

  it.each([
    ['failed', 'This raise failed.'],
    ['closed', 'This project is closed.'],
  ] as const)('offers no action once the project is %s', (status, note) => {
    renderControls(makeProject({ status }));

    expect(buttons()).toEqual([]);
    expect(screen.getByText(new RegExp(note))).toBeInTheDocument();
  });
});
