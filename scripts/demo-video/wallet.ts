import { generateKeyPairSync } from 'node:crypto';
import type { BrowserContext } from 'playwright';
import { E2E_BURNER_STORAGE_KEY } from '../../frontend/src/lib/solana/e2eBurnerKey';
import type { Director } from './director';

/** How long a person gets to approve in the wallet's pop-up; the wait is cut from the video. */
const APPROVAL_TIMEOUT = 5 * 60_000;

/**
 * The wallet the storyline signs with. The burner lives in the page and signs at once; it exists
 * only in a build made with NEXT_PUBLIC_E2E=1, which is the local stack. Phantom is a real
 * extension on a deployed site: a person approves each request, and the waits are cut.
 */
export interface Wallet {
  /** The name of the wallet's button in the app's wallet dialog. */
  readonly label: RegExp;
  /** Runs before any page of `context` loads. */
  prepare(context: BrowserContext): Promise<void>;
  /** Waits until the request the last click started is approved, then until `outcome` holds. */
  approve(director: Director, outcome: () => Promise<void>): Promise<void>;
  /** Makes the connected wallet the platform admin, for the console; false if it can't. */
  becomeAdmin(director: Director): Promise<boolean>;
}

/** A fresh ed25519 key as the 64 bytes Solana keeps: the seed, then the public key. */
function newSecretKey(): number[] {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return [...seed, ...pub];
}

export class BurnerWallet implements Wallet {
  readonly label = /E2E Burner/;
  private readonly secretKey = newSecretKey();

  constructor(private readonly adminSecretKey: number[] | null) {}

  async prepare(context: BrowserContext): Promise<void> {
    // Only when the page has no key yet: becomeAdmin() swaps it, and a reload must keep that.
    await context.addInitScript(
      ({ key, secretKey }) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, secretKey);
      },
      { key: E2E_BURNER_STORAGE_KEY, secretKey: JSON.stringify(this.secretKey) },
    );
  }

  async approve(director: Director, outcome: () => Promise<void>): Promise<void> {
    await director.cut(outcome);
  }

  async becomeAdmin(director: Director): Promise<boolean> {
    if (!this.adminSecretKey) return false;
    // The adapter reconnects after a reload and reads the key again.
    await director.page.evaluate(
      ({ key, secretKey }) => window.localStorage.setItem(key, secretKey),
      { key: E2E_BURNER_STORAGE_KEY, secretKey: JSON.stringify(this.adminSecretKey) },
    );
    return true;
  }
}

export class PhantomWallet implements Wallet {
  readonly label = /^Phantom/;

  async prepare(): Promise<void> {}

  async approve(director: Director, outcome: () => Promise<void>): Promise<void> {
    console.log('  → approve the request in Phantom');
    await director.cut(async () => {
      await outcome();
    });
  }

  async becomeAdmin(director: Director): Promise<boolean> {
    // Phantom switches accounts in its own window; the console follows the connected account.
    console.log('  → switch Phantom to the platform admin account; the console opens when it has');
    await director.cut(async () => {
      await director.page.goto('/admin');
      await director.page
        .getByText(/^Console · signed in as /)
        .waitFor({ timeout: APPROVAL_TIMEOUT });
    });
    return true;
  }
}

export { APPROVAL_TIMEOUT };
