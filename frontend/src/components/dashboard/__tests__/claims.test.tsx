import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WalletSignTransactionError } from '@solana/wallet-adapter-base';
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  Transaction,
  type PublicKey,
  type TransactionSignature,
} from '@solana/web3.js';
import { PROGRAM_ID } from '@/lib/solana/connection';
import { fixture, FixtureNode, fixtureProject, key } from '@/lib/solana/__tests__/fixtures/chain';
import { instructionDiscriminator } from '@/lib/solana/__tests__/fixtures/idl';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import type { Project } from '@/types/project';
import { ClaimAllButton } from '../ClaimAllButton';
import { ClaimButton } from '../ClaimButton';
import { RefundButton } from '../RefundButton';

const alice = key(fixture.projects.operating.holders[0]);

/** A wallet app that signs whatever it is asked to, or refuses with `refusal`. */
function walletApp(owner: PublicKey, refusal?: Error) {
  const sent: Transaction[] = [];
  const wallet = testWallet(owner, {
    sendTransaction: async (transaction): Promise<TransactionSignature> => {
      if (refusal) throw refusal;
      if (!(transaction instanceof Transaction)) throw new Error('Expected a legacy transaction');
      sent.push(transaction);
      return `signature${sent.length}`;
    },
  });
  return { wallet, sent };
}

function renderWith(node: FixtureNode, owner: PublicKey, ui: React.ReactElement, refusal?: Error) {
  const { wallet, sent } = walletApp(owner, refusal);
  render(
    <AppProviders connection={node} wallet={wallet}>
      {ui}
    </AppProviders>,
  );
  return sent;
}

const axelInstructions = (transaction: Transaction) =>
  transaction.instructions.filter((instruction) => instruction.programId.equals(PROGRAM_ID));

const computeLimit = (transaction: Transaction) => {
  const [first] = transaction.instructions;
  expect(first.programId.equals(ComputeBudgetProgram.programId)).toBe(true);
  return ComputeBudgetInstruction.decodeSetComputeUnitLimit(first).units;
};

describe('ClaimButton', () => {
  it("claims one car's revenue for the connected wallet", async () => {
    const project = await fixtureProject('operating');
    const onClaimed = vi.fn();
    const sent = renderWith(
      new FixtureNode(),
      alice,
      <ClaimButton project={project} onClaimed={onClaimed} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Claim' }));

    expect(await screen.findByText('Revenue claimed')).toBeInTheDocument();
    expect(onClaimed).toHaveBeenCalledTimes(1);
    const [claim] = axelInstructions(sent[0]);
    expect(claim.data).toEqual(instructionDiscriminator('claim'));
    expect([claim.keys[0].pubkey.equals(alice), claim.keys[1].pubkey.equals(alice)]).toEqual([
      true,
      true,
    ]);
  });

  it('says so when the wallet declines, and changes nothing', async () => {
    const project = await fixtureProject('operating');
    const onClaimed = vi.fn();
    renderWith(
      new FixtureNode(),
      alice,
      <ClaimButton project={project} onClaimed={onClaimed} />,
      new WalletSignTransactionError('User rejected the request.'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Claim' }));

    expect(await screen.findByText('Claim failed')).toBeInTheDocument();
    expect(screen.getByText('You declined the request in your wallet.')).toBeInTheDocument();
    expect(onClaimed).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeEnabled();
  });
});

describe('ClaimAllButton', () => {
  const cars = (count: number): Project[] =>
    Array.from({ length: count }, () => makeProject({ status: 'operating' }));

  it('claims every car, four per transaction', async () => {
    const onClaimed = vi.fn();
    const sent = renderWith(
      new FixtureNode(),
      alice,
      <ClaimAllButton projects={cars(5)} onClaimed={onClaimed} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Claim all' }));

    expect(await screen.findAllByText('Revenue claimed')).toHaveLength(2);
    expect(sent.map((transaction) => axelInstructions(transaction).length)).toEqual([4, 1]);
    expect(sent.map(computeLimit)).toEqual([240_000, 60_000]);
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });

  it('stops at the first transaction the program rejects and explains why', async () => {
    const node = new FixtureNode();
    node.outcome = { InstructionError: [1, { Custom: 6042 }] };
    const sent = renderWith(node, alice, <ClaimAllButton projects={cars(6)} onClaimed={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Claim all' }));

    expect(await screen.findByText("There's nothing to claim yet.")).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });
});

describe('RefundButton', () => {
  it('takes back the full price of the shares of a failed raise', async () => {
    const project = await fixtureProject('failed');
    const refunder = key(fixture.projects.failed.holders[0]);
    const onRefunded = vi.fn();
    const sent = renderWith(
      new FixtureNode(),
      refunder,
      <RefundButton project={project} shares={5n} onRefunded={onRefunded} />,
    );

    // Five shares at 10 000 tKZT.
    await userEvent.click(screen.getByRole('button', { name: 'Get 50,000 tKZT back' }));
    const dialog = screen.getByRole('dialog', { name: 'Get your money back' });
    expect(within(dialog).getByText('You get back').nextSibling).toHaveTextContent('50,000 tKZT');
    expect(sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm refund' }));

    expect(await screen.findByText('Refund received')).toBeInTheDocument();
    expect(screen.getByText('50,000 tKZT is back in your wallet.')).toBeInTheDocument();
    expect(onRefunded).toHaveBeenCalledTimes(1);
    const [refund] = axelInstructions(sent[0]);
    expect(refund.data).toEqual(instructionDiscriminator('refund'));
    expect(refund.keys[0].pubkey.equals(refunder)).toBe(true);
  });

  it('settles a raise that ran out below its goal in the same transaction as the refund', async () => {
    const project = makeProject({
      raiseDeadline: 1_700_000_000,
      sharesSold: 10n,
      softCapShares: 60n,
    });
    const sent = renderWith(
      new FixtureNode(),
      alice,
      <RefundButton project={project} shares={2n} onRefunded={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Get 20,000 tKZT back' }));
    expect(screen.getByText(/the same transaction settles it first/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm refund' }));

    expect(await screen.findByText('Refund received')).toBeInTheDocument();
    expect(axelInstructions(sent[0]).map((instruction) => instruction.data.subarray(0, 8))).toEqual(
      [instructionDiscriminator('finalize_raise'), instructionDiscriminator('refund')],
    );
  });
});
