import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, describe, it, vi, beforeEach } from 'vitest';
import { ConnectionStatus } from './ConnectionStatus';
import { NextIntlClientProvider } from 'next-intl';
import * as walletAdapter from '@solana/wallet-adapter-react';

const mockMessages = {
  ConnectionStatus: {
    connected: "Connected",
    disconnected: "Disconnected",
    connecting: "Connecting..."
  }
};

vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: vi.fn(),
}));

const renderWithIntl = (ui: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="en" messages={mockMessages}>
      {ui}
    </NextIntlClientProvider>
  );
};

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders disconnected state when no connection is provided', async () => {
    vi.mocked(walletAdapter.useConnection).mockReturnValue({
      connection: null,
    } as any);

    renderWithIntl(<ConnectionStatus />);
    
    // initially renders connecting but quickly changes, we await the resolved state
    const text = await screen.findByText('Disconnected');
    expect(text).toBeInTheDocument();
  });

  it('renders connected state when connection successfully returns version', async () => {
    vi.mocked(walletAdapter.useConnection).mockReturnValue({
      connection: {
        getVersion: vi.fn().mockResolvedValue({ 'solana-core': '1.16.0' })
      },
    } as any);

    renderWithIntl(<ConnectionStatus />);
    
    const text = await screen.findByText('Connected');
    expect(text).toBeInTheDocument();
  });

  it('renders disconnected state when connection throws error on getVersion', async () => {
    vi.mocked(walletAdapter.useConnection).mockReturnValue({
      connection: {
        getVersion: vi.fn().mockRejectedValue(new Error('RPC failed'))
      },
    } as any);

    renderWithIntl(<ConnectionStatus />);
    
    const text = await screen.findByText('Disconnected');
    expect(text).toBeInTheDocument();
  });
});
