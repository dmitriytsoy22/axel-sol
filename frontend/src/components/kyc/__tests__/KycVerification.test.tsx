import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ed25519 } from '@noble/curves/ed25519';
import { utils } from '@coral-xyz/anchor';
import { Keypair, type PublicKey } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { investorAddress } from '@/lib/solana/pda';
import { fixture, FixtureNode, key } from '@/lib/solana/__tests__/fixtures/chain';
import { patchProgramAccount } from '@/lib/solana/__tests__/fixtures/accountPatch';
import type { SumsubMessageHandler, SumsubWebSdk } from '@/lib/kyc/sumsub';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { KycVerification } from '../KycVerification';

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: vi.fn(), visible: false }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const API = 'https://api.axel.example';
const [alice] = fixture.projects.operating.holders.map(key);

/** The WebSDK as Sumsub's script defines it, recording what the page asked of it. */
function fakeSdk() {
  const launched: { token: string; container: string; lang: string }[] = [];
  let refresh: () => Promise<string> = () => Promise.reject(new Error('not initialized'));
  let emit: SumsubMessageHandler = () => undefined;
  const sdk: SumsubWebSdk = {
    init: (token, refreshToken) => {
      refresh = refreshToken;
      let lang = '';
      const builder = {
        withConf: (conf: { lang: string }) => {
          lang = conf.lang;
          return builder;
        },
        withOptions: () => builder,
        onMessage: (handler: SumsubMessageHandler) => {
          emit = handler;
          return builder;
        },
        build: () => ({ launch: (container: string) => launched.push({ token, container, lang }) }),
      };
      return builder;
    },
  };
  return {
    sdk,
    launched,
    refresh: () => refresh(),
    emit: (type: string, payload: unknown = {}) => emit(type, payload),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The backend's sign-in: a nonce per request, and a WebSDK token per verified signature. */
function backend(owner: Keypair, { sessionStatus = 200 } = {}) {
  const sessions: { wallet: string; nonce: string; signature: string }[] = [];
  let nonces = 0;
  const messageOf = (nonce: string) =>
    `axel.example wants you to sign in with your Solana account:\n${owner.publicKey.toBase58()}\n\nNonce: ${nonce}`;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${API}/kyc/nonce?wallet=${owner.publicKey.toBase58()}`) {
      nonces += 1;
      const nonce = `nonce-${nonces}`;
      return json({
        wallet: owner.publicKey.toBase58(),
        nonce,
        message: messageOf(nonce),
        expiresAt: '2026-09-25T09:00:00.000Z',
      });
    }
    if (url === `${API}/kyc/session` && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as (typeof sessions)[number];
      sessions.push(body);
      if (sessionStatus !== 200) {
        return json({ statusCode: sessionStatus, message: 'Refused' }, sessionStatus);
      }
      return json({
        wallet: body.wallet,
        externalUserId: 'axel-1',
        levelName: 'basic-kyc-level',
        accessToken: `token-for-${body.nonce}`,
        accessTokenExpiresAt: '2026-09-25T09:30:00.000Z',
      });
    }
    return json({ statusCode: 404, message: 'Not found' }, 404);
  });
  return { fetchMock, sessions, messageOf };
}

function signerOf(owner: Keypair) {
  return async (message: Uint8Array) => ed25519.sign(message, owner.secretKey.slice(0, 32));
}

function renderPage({
  owner,
  apiUrl = API,
  node = new FixtureNode(),
  signMessage,
  loadSdk = async () => fakeSdk().sdk,
}: {
  owner: PublicKey | null;
  apiUrl?: string | null;
  node?: FixtureNode;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  loadSdk?: () => Promise<SumsubWebSdk>;
}) {
  render(
    <AppProviders connection={node} wallet={testWallet(owner, { signMessage })}>
      <KycVerification apiUrl={apiUrl} loadSdk={loadSdk} />
    </AppProviders>,
  );
}

describe('KycVerification', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the wallet to verify when none is connected', () => {
    renderPage({ owner: null });

    expect(
      screen.getByRole('heading', { name: "Connect the wallet you'll invest from" }),
    ).toBeInTheDocument();
  });

  it('tells a wallet with a Sumsub approval that there is nothing to do', async () => {
    renderPage({ owner: alice });

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.getByText(/^Approved by Sumsub until /)).toBeInTheDocument();
    expect(screen.getByText('Nothing to do: this wallet is verified.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify identity' })).not.toBeInTheDocument();
  });

  it('offers the check to a wallet whose demo record only opens demo cars', async () => {
    const accounts = await patchProgramAccount('investor', investorAddress(alice), (record) => ({
      ...record,
      flags: 1,
    }));
    renderPage({ owner: alice, node: new FixtureNode(accounts) });

    expect(await screen.findByText('Demo access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify identity' })).toBeEnabled();
  });

  it('shows how to get demo access when the deployment runs no identity check', async () => {
    renderPage({ owner: Keypair.generate().publicKey, apiUrl: null });

    expect(await screen.findByText('Not verified')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "Identity checks aren't connected here" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/its \/demo page gives a wallet a 29-day demo record/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify identity' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs the backend's nonce with the wallet and opens Sumsub with the token for that wallet", async () => {
    const owner = Keypair.generate();
    const { fetchMock, sessions, messageOf } = backend(owner);
    vi.stubGlobal('fetch', fetchMock);
    const websdk = fakeSdk();
    renderPage({
      owner: owner.publicKey,
      signMessage: signerOf(owner),
      loadSdk: async () => websdk.sdk,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));

    expect(await screen.findByTestId('sumsub-websdk')).toBeInTheDocument();
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session).toMatchObject({ wallet: owner.publicKey.toBase58(), nonce: 'nonce-1' });
    expect(
      ed25519.verify(
        utils.bytes.bs58.decode(session.signature),
        new TextEncoder().encode(messageOf('nonce-1')),
        owner.publicKey.toBytes(),
      ),
    ).toBe(true);
    expect(websdk.launched).toEqual([
      { token: 'token-for-nonce-1', container: '#sumsub-websdk-container', lang: 'en' },
    ]);
    expect(screen.getByText(/Follow the steps in the Sumsub window/)).toBeInTheDocument();

    act(() => websdk.emit('idCheck.onApplicantSubmitted'));
    expect(screen.getByText(/^Submitted. Sumsub is reviewing your documents/)).toBeInTheDocument();

    act(() =>
      websdk.emit('idCheck.onApplicantStatusChanged', {
        reviewStatus: 'completed',
        reviewResult: { reviewAnswer: 'GREEN' },
      }),
    );
    expect(screen.getByText(/^Sumsub approved the check/)).toBeInTheDocument();
  });

  it('gets the WebSDK a new token with a new signature when the old one expires', async () => {
    const owner = Keypair.generate();
    const { fetchMock, sessions } = backend(owner);
    vi.stubGlobal('fetch', fetchMock);
    const websdk = fakeSdk();
    renderPage({
      owner: owner.publicKey,
      signMessage: signerOf(owner),
      loadSdk: async () => websdk.sdk,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));
    await screen.findByTestId('sumsub-websdk');

    await expect(websdk.refresh()).resolves.toBe('token-for-nonce-2');
    expect(sessions.map(({ nonce }) => nonce)).toEqual(['nonce-1', 'nonce-2']);
    // The running WebSDK takes the token itself; it is not launched a second time.
    expect(websdk.launched).toHaveLength(1);
  });

  it.each([
    {
      failure: 'a wallet that cannot sign messages',
      setup: (owner: Keypair) => ({ signMessage: undefined, fetchMock: backend(owner).fetchMock }),
      message: "This wallet can't sign messages",
    },
    {
      failure: 'a declined signature',
      setup: (owner: Keypair) => ({
        signMessage: async () => {
          throw new Error('User rejected the request.');
        },
        fetchMock: backend(owner).fetchMock,
      }),
      message: 'You declined the signature in your wallet.',
    },
    {
      failure: 'a used or expired nonce',
      setup: (owner: Keypair) => ({
        signMessage: signerOf(owner),
        fetchMock: backend(owner, { sessionStatus: 401 }).fetchMock,
      }),
      message: 'The sign-in expired or was already used. Try again.',
    },
    {
      failure: 'a backend without Sumsub credentials',
      setup: (owner: Keypair) => ({
        signMessage: signerOf(owner),
        fetchMock: backend(owner, { sessionStatus: 503 }).fetchMock,
      }),
      message: 'The AXEL backend has identity checks switched off right now.',
    },
  ])('explains $failure and lets the reader try again', async ({ setup, message }) => {
    const owner = Keypair.generate();
    const { signMessage, fetchMock } = setup(owner);
    vi.stubGlobal('fetch', fetchMock);
    renderPage({ owner: owner.publicKey, signMessage });

    await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByTestId('sumsub-websdk')).not.toBeInTheDocument();
  });

  it("says so when Sumsub's script cannot load", async () => {
    const owner = Keypair.generate();
    vi.stubGlobal('fetch', backend(owner).fetchMock);
    renderPage({
      owner: owner.publicKey,
      signMessage: signerOf(owner),
      loadSdk: async () => {
        throw new Error("Couldn't load the script");
      },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Verify identity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the Sumsub window.");
  });
});
