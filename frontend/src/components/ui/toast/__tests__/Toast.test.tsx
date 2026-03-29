import React, { useEffect } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider, useToast } from '../ToastProvider';

const mockMessages = {
  Toast: {
    viewExplorer: 'view explorer test'
  }
};

const TestComponent = () => {
  const { addToast } = useToast();
  
  useEffect(() => {
    addToast({
      variant: 'success',
      title: 'Success Title',
      message: 'Success Message',
      txHash: '1234abcd',
      duration: 3000
    });
  }, [addToast]);
  
  return null;
};

const renderWithProvider = (ui: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="en" messages={mockMessages}>
      <ToastProvider>
        {ui}
      </ToastProvider>
    </NextIntlClientProvider>
  );
};

describe('ToastSystem', () => {
  it('renders a toast and removes it after duration', () => {
    vi.useFakeTimers();
    renderWithProvider(<TestComponent />);

    expect(screen.getByText('Success Title')).toBeInTheDocument();
    expect(screen.getByText('Success Message')).toBeInTheDocument();
    expect(screen.getByText('view explorer test')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.queryByText('Success Title')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });

  it('closes early on manual close', async () => {
    renderWithProvider(<TestComponent />);

    expect(screen.getByText('Success Title')).toBeInTheDocument();
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    
    act(() => {
      fireEvent.click(closeButton);
    });

    await waitFor(() => {
      expect(screen.queryByText('Success Title')).not.toBeInTheDocument();
    });
  });
});
