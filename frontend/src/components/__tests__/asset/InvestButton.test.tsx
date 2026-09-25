import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import messagesEn from '../../../../messages/en.json';
import { InvestButton } from '../../asset/InvestButton';
import type { Approval, SaleState } from '../../asset/saleState';

vi.mock('@solana/wallet-adapter-react', () => ({ useWallet: vi.fn() }));
vi.mock('@solana/wallet-adapter-react-ui', () => ({ useWalletModal: vi.fn() }));

function renderButton(
  { saleState = 'open', approval = 'eligible' }: { saleState?: SaleState; approval?: Approval },
  { connected }: { connected: boolean },
) {
  vi.mocked(useWallet).mockReturnValue({ connected } as ReturnType<typeof useWallet>);
  const onInvestClick = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <InvestButton saleState={saleState} approval={approval} onInvestClick={onInvestClick} />
    </NextIntlClientProvider>,
  );
  return { onInvestClick };
}

describe('InvestButton', () => {
  const setVisible = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWalletModal).mockReturnValue({ setVisible, visible: false });
  });

  it('opens the wallet picker when no wallet is connected', async () => {
    renderButton({ approval: 'unverified' }, { connected: false });

    await userEvent.click(screen.getByRole('button', { name: 'Connect wallet to buy' }));

    expect(setVisible).toHaveBeenCalledWith(true);
  });

  it('opens the purchase for a verified wallet', async () => {
    const { onInvestClick } = renderButton({ approval: 'eligible' }, { connected: true });

    await userEvent.click(screen.getByRole('button', { name: 'Buy shares' }));

    expect(onInvestClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unverified', 'Wallet not verified'],
    ['revoked', 'Verification withdrawn'],
    ['frozen', 'Wallet frozen'],
    ['expired', 'Verification expired'],
    ['demoNotAllowed', 'Demo access not accepted'],
    ['checking', 'Checking wallet…'],
    ['unknown', "Couldn't check wallet"],
  ] as const)('names a %s wallet instead of offering the purchase', (approval, label) => {
    renderButton({ approval }, { connected: true });

    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Buy shares' })).not.toBeInTheDocument();
  });

  it.each([
    ['ended', 'Raise ended'],
    ['funded', 'Fully funded'],
    ['operating', 'Raise complete'],
    ['paused', 'Raise complete'],
    ['failed', 'Raise failed'],
    ['closed', 'Project closed'],
  ] as const)('says why a %s car cannot be bought, even before connecting', (saleState, label) => {
    renderButton({ saleState }, { connected: false });

    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Connect wallet to buy' })).not.toBeInTheDocument();
  });
});
