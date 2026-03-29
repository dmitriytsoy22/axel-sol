import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, describe, it, vi, beforeAll, afterAll } from 'vitest';
import { RpcErrorBoundary } from './RpcErrorBoundary';
import { NextIntlClientProvider } from 'next-intl';

const mockMessages = {
  RpcError: {
    title: 'Connection Error',
    description: 'Failed to load on-chain data.',
    retry: 'Try Again'
  }
};

const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test RPC Error');
  }
  return <div>Healthy Content</div>;
};

const renderWithIntl = (ui: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="en" messages={mockMessages}>
      {ui}
    </NextIntlClientProvider>
  );
};

describe('RpcErrorBoundary', () => {
  // Prevent React from logging expected errors in the console during test
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    renderWithIntl(
      <RpcErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </RpcErrorBoundary>
    );

    expect(screen.getByText('Healthy Content')).toBeInTheDocument();
  });

  it('renders standard fallback UI when error is thrown', () => {
    renderWithIntl(
      <RpcErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </RpcErrorBoundary>
    );

    expect(screen.queryByText('Healthy Content')).not.toBeInTheDocument();
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load on-chain data.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('calls onReset and attempts to unmount fallback when Retry is clicked', () => {
    const handleReset = vi.fn();
    
    const TestApp = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);
      return (
        <RpcErrorBoundary onReset={() => setShouldThrow(false)}>
          <ThrowingComponent shouldThrow={shouldThrow} />
        </RpcErrorBoundary>
      );
    };

    renderWithIntl(<TestApp />);

    // Initial throw sets boundary state
    expect(screen.getByText('Connection Error')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Try Again' });
    fireEvent.click(retryButton);

    // After retry, setShouldThrow(false) is called, which updates the test app.
    // The boundary is now rendering the healthy content.
    expect(screen.getByText('Healthy Content')).toBeInTheDocument();
    expect(screen.queryByText('Connection Error')).not.toBeInTheDocument();
  });
});
