import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, type PublicKey } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { demoAccounts, DemoNode, FLEET_MINT } from '@/lib/demo/__tests__/fixtures';
import type { DemoStatus } from '@/lib/demo/api';
import { DemoApiError, sessionStorageKey, type DemoApi } from '@/lib/demo/client';
import { fixture, key } from '@/lib/solana/__tests__/fixtures/chain';
import { DemoWalkthrough } from '../DemoWalkthrough';

const { setVisible } = vi.hoisted(() => ({ setVisible: vi.fn() }));
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible, visible: false }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function status(overrides: Partial<DemoStatus> = {}): DemoStatus {
  return {
    available: true,
    code: null,
    message: null,
    turnstile: false,
    sharedLimits: true,
    faucet: { address: 'faucet', lamports: 5e9, floorLamports: 5e7 },
    access: {
      granted: 3,
      cap: 80,
      perIpPerDay: 3,
      dripAmount: '50000000000',
      dripLamports: 10_000_000,
    },
    fleet: {
      mint: FLEET_MINT.toBase58(),
      status: 'operating',
      periods: 3,
      periodCap: 150,
      deskShares: '20',
      sharesPerWallet: '5',
      cooldownSeconds: null,
      simulationsPerWalletPerDay: 3,
    },
    wallet: null,
    ...overrides,
  };
}

function fakeApi(current: DemoStatus = status()) {
  return {
    status: vi.fn(async () => current),
    nonce: vi.fn(async (wallet: string) => ({
      nonce: 'n1.1.abc.mac',
      message: `AXEL devnet demo access\nWallet: ${wallet}`,
      expiresAt: 0,
    })),
    access: vi.fn<DemoApi['access']>(async () => ({
      status: 'granted',
      signature: '5sig',
      confirmed: true,
      dripAmount: '50000000000',
      dripLamports: 10_000_000,
      session: 'session-token',
      sessionExpiresAt: fixture.now + 3600,
    })),
    shares: vi.fn<DemoApi['shares']>(async () => ({
      signature: '5shares',
      confirmed: true,
      mint: FLEET_MINT.toBase58(),
      shares: '5',
    })),
    simulateMonth: vi.fn<DemoApi['simulateMonth']>(),
  };
}

async function renderWalkthrough(
  owner: PublicKey | null,
  api: ReturnType<typeof fakeApi>,
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>,
) {
  render(
    <AppProviders
      connection={new DemoNode(await demoAccounts())}
      wallet={testWallet(owner, signMessage ? { signMessage } : {})}
    >
      <DemoWalkthrough api={api} />
    </AppProviders>,
  );
}

const step = (name: string) => screen.getByRole('heading', { name }).closest('li')!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(fixture.now * 1000);
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DemoWalkthrough', () => {
  it('asks for a wallet first and says what the demo gives it', async () => {
    await renderWalkthrough(null, fakeApi());

    expect(screen.getByRole('heading', { name: 'Connect a wallet to start' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(setVisible).toHaveBeenCalledWith(true);
  });

  it('starts a new wallet at step 1 and lists the raises that take demo investors', async () => {
    await renderWalkthrough(Keypair.generate().publicKey, fakeApi());

    await screen.findByRole('heading', { name: 'Get demo access' });
    expect(step('Get demo access')).toHaveAttribute('aria-current', 'step');
    expect(
      within(step('Get demo access')).getByText(/sends 50,000 tKZT and 0.01 SOL/),
    ).toBeInTheDocument();
    const raise = within(step('Buy shares in an open raise'));
    expect(await raise.findByText('12 of 100 sold')).toBeInTheDocument();
    expect(raise.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      `/assets/${fixture.projects.fundraising.shareMint}`,
    );
    // Shares need access and a session first.
    expect(within(step('Receive shares of a car on the road')).getByRole('button')).toBeDisabled();
  });

  it('signs the message the server issued and keeps the session it returns', async () => {
    const api = fakeApi();
    const judge = Keypair.generate().publicKey;
    const signature = new Uint8Array(64).fill(7);
    const signed: string[] = [];
    await renderWalkthrough(judge, api, async (message) => {
      signed.push(new TextDecoder().decode(message));
      return signature;
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Sign and get access' }));

    expect(await screen.findByText('Demo access granted')).toBeInTheDocument();
    expect(signed).toEqual([`AXEL devnet demo access\nWallet: ${judge.toBase58()}`]);
    expect(api.access).toHaveBeenCalledWith({
      wallet: judge.toBase58(),
      nonce: 'n1.1.abc.mac',
      signature: utils.bytes.bs58.encode(signature),
    });
    expect(JSON.parse(window.localStorage.getItem(sessionStorageKey(judge.toBase58()))!)).toEqual({
      session: 'session-token',
      expiresAt: fixture.now + 3600,
    });
  });

  it('shows a refusal of the access route in the reader’s words', async () => {
    const api = fakeApi();
    api.access.mockRejectedValueOnce(
      new DemoApiError({ code: 'ip_limit', message: 'At most 3 wallets' }, 429),
    );
    await renderWalkthrough(Keypair.generate().publicKey, api, async () => new Uint8Array(64));

    await userEvent.click(await screen.findByRole('button', { name: 'Sign and get access' }));

    expect(await within(step('Get demo access')).findByRole('alert')).toHaveTextContent(
      'This network has already set up the most demo wallets allowed today.',
    );
  });

  it('takes a holder of the demo car straight to claiming what it earned', async () => {
    const holder = key(fixture.projects.operating.holders[1]);
    await renderWalkthrough(holder, fakeApi());

    const claim = await screen.findByRole('button', { name: 'Claim 668.98 tKZT' });
    expect(claim.closest('li')).toHaveAttribute('aria-current', 'step');
    for (const done of [
      'Get demo access',
      'Buy shares in an open raise',
      'Receive shares of a car on the road',
      'Simulate a month of income',
    ]) {
      expect(step(done)).toHaveAttribute('data-state', 'done');
    }
  });

  it('asks the desk for shares with the stored session of a verified wallet', async () => {
    const holder = key(fixture.projects.fundraising.holders[0]);
    window.localStorage.setItem(
      sessionStorageKey(holder.toBase58()),
      JSON.stringify({ session: 'stored-session', expiresAt: fixture.now + 60 }),
    );
    const api = fakeApi();
    await renderWalkthrough(holder, api);

    await userEvent.click(await screen.findByRole('button', { name: 'Receive 5 shares' }));

    expect(api.shares).toHaveBeenCalledWith({
      wallet: holder.toBase58(),
      session: 'stored-session',
    });
    expect(await screen.findByText('Shares received')).toBeInTheDocument();
  });

  it('holds the simulation while another month is cooling down', async () => {
    const holder = key(fixture.projects.operating.holders[1]);
    window.localStorage.setItem(
      sessionStorageKey(holder.toBase58()),
      JSON.stringify({ session: 's', expiresAt: fixture.now + 60 }),
    );
    const cooling = status({ fleet: { ...status().fleet!, cooldownSeconds: 42 } });
    await renderWalkthrough(holder, fakeApi(cooling));

    await screen.findByRole('heading', { name: 'Simulate a month of income' });
    const simulate = within(step('Simulate a month of income'));
    expect(
      await simulate.findByText('The next month can be simulated in 42 s.'),
    ).toBeInTheDocument();
    expect(simulate.getByRole('button', { name: 'Simulate another month' })).toBeDisabled();
  });

  it('says why the demo is unavailable instead of offering steps that would fail', async () => {
    await renderWalkthrough(
      Keypair.generate().publicKey,
      fakeApi(status({ available: false, code: 'faucet_low', fleet: null })),
    );

    expect(
      await screen.findByRole('heading', {
        name: "The demo can't hand out access right now",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The demo faucet has run out of devnet SOL. Please try again later.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign and get access' })).not.toBeInTheDocument();
  });
});
