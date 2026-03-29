import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { TransactionStatus, TransactionStatusVariant } from '../TransactionStatus';

const mockMessages = {
  TransactionStatus: {
    preflight: 'preflight test',
    awaitingWallet: 'awaiting test',
    sending: 'sending test',
    confirming: 'confirming test',
    success: 'success test',
    error: 'error test'
  }
};

const renderWithIntl = (status: TransactionStatusVariant, errorMessage?: string) => {
  return render(
    <NextIntlClientProvider locale="en" messages={mockMessages}>
      <TransactionStatus status={status} errorMessage={errorMessage} />
    </NextIntlClientProvider>
  );
};

describe('TransactionStatus', () => {
  it('renders nothing on idle', () => {
    const { container } = renderWithIntl('idle');
    expect(container.firstChild).toBeNull();
  });

  it('renders processing states correctly', () => {
    ['preflight', 'awaiting_wallet', 'sending', 'confirming'].forEach((status) => {
      renderWithIntl(status as TransactionStatusVariant);
      const textKey = status === 'preflight' ? 'preflight test'
                    : status === 'awaiting_wallet' ? 'awaiting test'
                    : status === 'sending' ? 'sending test'
                    : 'confirming test';
      expect(screen.getByText(textKey)).toBeInTheDocument();
    });
  });

  it('renders success correctly', () => {
    renderWithIntl('success');
    expect(screen.getByText('success test')).toBeInTheDocument();
  });

  it('renders error state including message', () => {
    renderWithIntl('error', 'Critical failure');
    expect(screen.getByText('error test')).toBeInTheDocument();
    expect(screen.getByText('Critical failure')).toBeInTheDocument();
  });
});
