import '@testing-library/jest-dom';
import { vi } from 'vitest';

if (typeof window !== 'undefined') {
  // jsdom installs its own Uint8Array, while Buffer, TextEncoder and the hash libraries behind
  // @solana/web3.js create Node's. Their `instanceof Uint8Array` checks then fail and every PDA
  // derivation throws "Uint8Array expected"; giving both one realm is what a browser has.
  globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor;

  // Mock matchMedia for jsdom compatibility with some React components
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
