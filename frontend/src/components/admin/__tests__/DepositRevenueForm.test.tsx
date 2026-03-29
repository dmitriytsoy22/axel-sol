import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepositRevenueForm } from '../DepositRevenueForm';
import { ProjectState } from '@/types/project';

// Mocks
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `mock_t_${key}`,
}));

const mockSendTransaction = vi.fn();
vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: { toBase58: () => 'wallet_123' },
    sendTransaction: mockSendTransaction,
  }),
  useConnection: () => ({
    connection: {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: 'mock_hash',
        lastValidBlockHeight: 1234,
      }),
    },
  }),
}));

const mockConfirmTransaction = vi.fn();
vi.mock('@/hooks/useTransactionConfirmation', () => ({
  useTransactionConfirmation: () => ({
    confirmTransaction: mockConfirmTransaction,
    txState: 'idle',
  }),
}));

const mockProject: ProjectState = {
  admin: 'wallet_123',
  mint: 'mint_123',
  escrowVault: 'escrow1',
  revenueVault: 'revenue1',
  status: 'active',
  totalTokenSupply: 10000,
  tokensRemaining: 0,
  pricePerToken: 1,
  minInvestment: 50,
  maxInvestment: 500,
  solRaised: 5000,
  minRaise: 1000,
  maxRaise: 5000,
  deadline: 1234567890,
  investorCount: 120,
  carMake: 'Tesla',
  carModel: 'Model 3',
  carYear: 2024,
  vin: '1234567890ABC',
  licensePlate: 'ABC-123',
  imageUrl: 'https://example.com/image.jpg',
};

describe('DepositRevenueForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  
  it('calls sendTransaction on valid submit', async () => {
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
    
    // Will wait for confirmation
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
