import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';
import messagesEn from '../../../../messages/en.json';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import {
  buildCloseProjectInstruction,
  buildPauseProjectInstruction,
} from '@/lib/solana/instructions';
import { ProjectControls } from '../ProjectControls';

const { sendTransaction, confirmTransaction } = vi.hoisted(() => ({
  sendTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
}));

const operator = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey.toBase58();

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({ publicKey: operator, sendTransaction }),
  useConnection: () => ({
    connection: {
      getLatestBlockhash: async () => ({ blockhash: 'hash', lastValidBlockHeight: 1 }),
    },
  }),
}));
vi.mock('@/hooks/useTransactionConfirmation', () => ({
  useTransactionConfirmation: () => ({ confirmTransaction }),
}));
// Anchor encoding is out of scope here (see DepositRevenueForm.test for why).
vi.mock('@/lib/solana/instructions', () => ({
  buildPauseProjectInstruction: vi.fn(),
  buildResumeProjectInstruction: vi.fn(),
  buildCloseProjectInstruction: vi.fn(),
}));

const instruction = new TransactionInstruction({
  keys: [],
  programId: new PublicKey('DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M'),
  data: Buffer.from([1]),
});

function renderControls(status: 'active' | 'paused' | 'closed') {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <ProjectControls project={makeProject({ mint, status })} />
    </NextIntlClientProvider>,
  );
}

describe('ProjectControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendTransaction.mockResolvedValue('signature');
    confirmTransaction.mockResolvedValue({ success: true });
    vi.mocked(buildCloseProjectInstruction).mockResolvedValue(instruction);
    vi.mocked(buildPauseProjectInstruction).mockResolvedValue(instruction);
  });

  it('asks before closing a project, and sends nothing until confirmed', async () => {
    renderControls('active');

    await userEvent.click(screen.getByRole('button', { name: 'Close project…' }));

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "Close Toyota Camry for good? This can't be undone.",
    );
    expect(sendTransaction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Close permanently' }));

    await waitFor(() => expect(sendTransaction).toHaveBeenCalledTimes(1));
    expect(buildCloseProjectInstruction).toHaveBeenCalledTimes(1);
  });

  it('backs out of closing without a transaction', async () => {
    renderControls('active');

    await userEvent.click(screen.getByRole('button', { name: 'Close project…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('offers pause for an active car and resume for a paused one', () => {
    renderControls('active');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('offers resume, not pause, for a paused car', () => {
    renderControls('paused');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('offers no action on a closed project', () => {
    renderControls('closed');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText('This project is closed. No further changes are possible.'),
    ).toBeInTheDocument();
  });
});
