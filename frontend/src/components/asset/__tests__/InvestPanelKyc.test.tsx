import React from 'react';
import { render, screen } from '@testing-library/react';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';
import { FixtureConnection } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { InvestPanel } from '../InvestPanel';
import type { Approval } from '../saleState';

// A deployment with the backend's identity check (NEXT_PUBLIC_KYC_API_URL).
vi.mock('@/lib/api/kyc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/kyc')>()),
  KYC_API_URL: 'https://api.axel.example',
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));

function renderPanel(approval: Approval) {
  render(
    <AppProviders connection={new FixtureConnection()} wallet={testWallet(PublicKey.unique())}>
      <InvestPanel
        project={makeProject({ raiseDeadline: 1_900_000_000 })}
        saleState="open"
        approval={approval}
        position={null}
        now={1_800_000_000}
        onBuy={vi.fn()}
        onChanged={vi.fn()}
      />
    </AppProviders>,
  );
}

describe('InvestPanel with an identity check', () => {
  it.each<Approval>(['unverified', 'expired', 'revoked', 'demoNotAllowed'])(
    'sends a %s wallet to verify its identity',
    (approval) => {
      renderPanel(approval);

      expect(screen.getByRole('link', { name: 'Verify identity' })).toHaveAttribute(
        'href',
        '/verify',
      );
    },
  );

  it.each<Approval>(['eligible', 'frozen', 'checking'])(
    'offers no identity check to a %s wallet',
    (approval) => {
      renderPanel(approval);

      expect(screen.queryByRole('link', { name: 'Verify identity' })).not.toBeInTheDocument();
    },
  );
});
