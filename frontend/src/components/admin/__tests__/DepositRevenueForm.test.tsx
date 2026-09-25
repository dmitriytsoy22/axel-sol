import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { DepositRevenueForm } from '../DepositRevenueForm';
import { ProjectState } from '@/types/project';
import { buildDepositRevenueInstruction } from '@/lib/solana/instructions';

// Mocks
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `mock_t_${key}`,
}));

const adminWallet = Keypair.generate().publicKey;
const projectMint = Keypair.generate().publicKey;

const mockSendTransaction = vi.fn();
const mockConnection = {
  getLatestBlockhash: vi.fn(),
};
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: adminWallet,
    sendTransaction: mockSendTransaction,
  }),
  useConnection: () => ({
    connection: mockConnection,
  }),
}));

// Anchor instruction encoding is not exercised here: under jsdom, PDA hashing in
// @solana/web3.js rejects Node Buffers ("Uint8Array expected").
const depositInstruction = new TransactionInstruction({
  keys: [],
  programId: new PublicKey('DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M'),
  data: Buffer.from([1, 2, 3]),
});
vi.mock('@/lib/solana/instructions', () => ({
  buildDepositRevenueInstruction: vi.fn(),
}));

const mockConfirmTransaction = vi.fn();
vi.mock('@/hooks/useTransactionConfirmation', () => ({
  useTransactionConfirmation: () => ({
    confirmTransaction: mockConfirmTransaction,
    txState: 'idle',
  }),
}));

const mockProject: ProjectState = {
  admin: adminWallet.toBase58(),
  mint: projectMint.toBase58(),
  revenueVault: 'revenue1',
  status: 'active',
  totalTokenSupply: 10000,
  tokensRemaining: 0,
  pricePerToken: 1,
  tokensSold: 10000,
  periodCount: 2,
  oraclePubkey: 'oracle1',
  bump: 0,
  revenueVaultBump: 0,
  carMake: 'Tesla',
  carModel: 'Model 3',
  carYear: 2024,
  vin: '1234567890ABC',
  imageUrl: 'https://example.com/image.jpg',
};

describe('DepositRevenueForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection.getLatestBlockhash.mockResolvedValue({
      blockhash: 'mock_hash',
      lastValidBlockHeight: 1234,
    });
    vi.mocked(buildDepositRevenueInstruction).mockResolvedValue(depositInstruction);
  });

  it('renders correctly', () => {
    render(<DepositRevenueForm project={mockProject} />);
    expect(screen.getByText('mock_t_depositRevenue')).toBeInTheDocument();
    
    // Check for inputs
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(3); // grossRevenue, expenses, maintenanceReserve
  });

  it('keeps button disabled if net profit <= 0', () => {
    render(<DepositRevenueForm project={mockProject} />);
    const submitBtn = screen.getByRole('button', { name: /mock_t_depositBtn/i });
    expect(submitBtn).toBeDisabled();
  });

  it('allows submission when net profit is positive', async () => {
    render(<DepositRevenueForm project={mockProject} />);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    
    // Inputs are rendered in order: grossRevenue, expenses, maintenanceReserve
    // Set Gross Revenue: 10
    fireEvent.change(inputs[0], { target: { value: '10' } });
    
    const submitBtn = screen.getByRole('button', { name: /mock_t_depositBtn/i });
    
    await waitFor(() => {
      expect(submitBtn).toBeEnabled();
    });

    // Verify calculated profit indicator text updates
    expect(screen.getByText('10.000 SOL')).toBeInTheDocument();

    // Set Expenses: 2
    fireEvent.change(inputs[1], { target: { value: '2' } });
    await waitFor(() => {
      expect(screen.getByText('8.000 SOL')).toBeInTheDocument();
    });
  });

  it('shows error if values are negative', async () => {
    render(<DepositRevenueForm project={mockProject} />);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    
    fireEvent.change(inputs[0], { target: { value: '-5' } });
    fireEvent.submit(screen.getByRole('button', { name: /mock_t_depositBtn/i }));
    
    await waitFor(() => {
      expect(screen.getByText('Must be positive')).toBeInTheDocument();
    });
  });
  
  it('deposits the net profit in lamports into the next revenue period', async () => {
    mockSendTransaction.mockResolvedValue('tx_signature');
    mockConfirmTransaction.mockResolvedValue({ success: true, signature: 'tx_signature' });

    render(<DepositRevenueForm project={mockProject} />);
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];

    fireEvent.change(inputs[0], { target: { value: '10' } }); // grossRevenue
    fireEvent.change(inputs[1], { target: { value: '2' } }); // expenses
    fireEvent.change(inputs[2], { target: { value: '1' } }); // maintenanceReserve

    const submitBtn = screen.getByRole('button', { name: /mock_t_depositBtn/i });
    await waitFor(() => expect(submitBtn).toBeEnabled());

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    });

    // Net profit 10 - 2 - 1 = 7 SOL; on-chain period_index must equal project.periodCount
    expect(buildDepositRevenueInstruction).toHaveBeenCalledTimes(1);
    const params = vi.mocked(buildDepositRevenueInstruction).mock.calls[0][0];
    expect(params.wallet.publicKey.toBase58()).toBe(adminWallet.toBase58());
    expect(params.mint.toBase58()).toBe(projectMint.toBase58());
    expect(params.periodIndex).toBe(2);
    expect(params.amount).toBe(7_000_000_000);
    expect(params.connection).toBe(mockConnection);

    const [transaction, connection] = mockSendTransaction.mock.calls[0];
    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.instructions).toEqual([depositInstruction]);
    expect(connection).toBe(mockConnection);

    await waitFor(() => {
      expect(mockConfirmTransaction).toHaveBeenCalledWith(
        'tx_signature',
        'mock_hash',
        1234,
        'mock_t_depositRevenue'
      );
    });
  });
});
