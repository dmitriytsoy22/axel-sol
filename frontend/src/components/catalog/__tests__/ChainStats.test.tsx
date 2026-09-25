import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import { ChainStats } from '../ChainStats';
import { makeProject } from './fixtures';

function renderStats(feed: Partial<React.ComponentProps<typeof ChainStats>> = {}) {
  const onRetry = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <ChainStats projects={[]} isLoading={false} error={null} onRetry={onRetry} {...feed} />
    </NextIntlClientProvider>,
  );
  return { onRetry };
}

const statValue = (label: string): string | null | undefined =>
  screen.getByText(label).parentElement?.querySelector('dd')?.textContent;

describe('ChainStats', () => {
  it('shows totals computed from the cars on the chain', () => {
    renderStats({
      projects: [
        makeProject({
          tokensSold: 13,
          totalTokenSupply: 100,
          pricePerToken: 100_000_000,
          periodCount: 2,
        }),
        makeProject({ tokensSold: 7, totalTokenSupply: 100, pricePerToken: 100_000_000 }),
      ],
    });

    expect(screen.getByText('Live from Solana devnet')).toBeInTheDocument();
    expect(statValue('Cars listed')).toBe('2');
    expect(statValue('Shares sold')).toBe('20 of 200');
    expect(statValue('Value of shares sold')).toBe('2 SOL');
    expect(statValue('Payout periods')).toBe('2');
  });

  it('shows no figures until the chain has been read', () => {
    renderStats({ isLoading: true, projects: [makeProject({ tokensSold: 13 })] });

    expect(screen.getByText('Reading Solana devnet…')).toBeInTheDocument();
    expect(statValue('Shares sold')).toBe('');
  });

  it('replaces the figures with a retry when the chain cannot be read', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderStats({ error: new Error('fetch failed') });

    expect(screen.getByText("Couldn't reach Solana devnet.")).toBeInTheDocument();
    expect(screen.queryByText('Cars listed')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
