import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { WalletContext, type Wallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState } from '@solana/wallet-adapter-base';
// The provider's two adapters, from their own packages: the wallets bundle loads Ledger's ESM,
// which vitest can't resolve.
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import messagesRu from '../../../../messages/ru.json';
import { testWallet } from '@/__tests__/helpers/providers';
import { E2eBurnerWalletAdapter } from '@/lib/solana/e2eBurnerWallet';
import { WalletPickerProvider } from '../WalletPicker';

const phantom: Wallet = {
  adapter: new PhantomWalletAdapter(),
  readyState: WalletReadyState.NotDetected,
};
const solflare: Wallet = {
  adapter: new SolflareWalletAdapter(),
  readyState: WalletReadyState.NotDetected,
};
const burner: Wallet = {
  adapter: new E2eBurnerWalletAdapter(),
  readyState: WalletReadyState.Installed,
};

/** A "Connect wallet" button as the app's are: it only asks the modal context to open. */
function ConnectButton(): JSX.Element {
  const { setVisible } = useWalletModal();
  return (
    <button type="button" onClick={() => setVisible(true)}>
      Подключить кошелёк
    </button>
  );
}

function renderPicker(wallets: Wallet[]) {
  const select = vi.fn();
  render(
    <NextIntlClientProvider locale="ru" messages={messagesRu}>
      <WalletContext.Provider value={testWallet(null, { wallets, select })}>
        <WalletPickerProvider>
          <ConnectButton />
        </WalletPickerProvider>
      </WalletContext.Provider>
    </NextIntlClientProvider>,
  );
  return select;
}

describe('WalletPicker', () => {
  it("lists the installed wallets first, in the reader's language, and picks one", async () => {
    const select = renderPicker([phantom, solflare, burner]);

    await userEvent.click(screen.getByRole('button', { name: 'Подключить кошелёк' }));

    const dialog = screen.getByRole('dialog', { name: 'Подключите кошелёк Solana' });
    expect(dialog).toHaveTextContent('Установлен');
    expect(screen.queryByRole('button', { name: /^Phantom/ })).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: 'Другие кошельки' });
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Phantom/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /E2E Burner/ }));

    expect(select).toHaveBeenCalledWith(burner.adapter.name);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says what to do when no wallet is installed, and still lists the wallets', async () => {
    renderPicker([phantom, solflare]);

    await userEvent.click(screen.getByRole('button', { name: 'Подключить кошелёк' }));

    const dialog = screen.getByRole('dialog', { name: 'Нужен кошелёк Solana' });
    expect(dialog).toHaveTextContent('Установите один из этих кошельков');
    expect(screen.getByRole('button', { name: /^Phantom/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Solflare/ })).toBeInTheDocument();
  });
});
