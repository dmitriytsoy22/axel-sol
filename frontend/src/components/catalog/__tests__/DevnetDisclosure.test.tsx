import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../../messages/en.json';

/** The network is read when `@/lib/network` loads, so each test loads the section afresh. */
async function renderDisclosure(network: string): Promise<void> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SOLANA_NETWORK', network);
  const { DevnetDisclosure } = await import('../DevnetDisclosure');
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <DevnetDisclosure />
    </NextIntlClientProvider>,
  );
}

const sectionTitle = (): string => screen.getByRole('heading', { level: 2 }).textContent ?? '';

describe('DevnetDisclosure', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['localnet', 'devnet', 'testnet'])(
    'names the test network the app reads, %s',
    async (network) => {
      await renderDisclosure(network);

      expect(sectionTitle()).toBe(`This is a ${network} demo`);
      expect(
        screen.getByText(`AXEL runs on Solana ${network}, a test network.`, { exact: false }),
      ).toBeInTheDocument();
    },
  );

  it('on mainnet only lists what can go wrong with a real car', async () => {
    await renderDisclosure('mainnet-beta');

    expect(sectionTitle()).toBe('What can go wrong with a real car');
    expect(screen.queryByText('a test network', { exact: false })).not.toBeInTheDocument();
  });
});
