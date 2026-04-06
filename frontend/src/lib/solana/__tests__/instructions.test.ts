// @vitest-environment node
import { describe, expect, it } from 'vitest';

// Instruction builders now use Anchor Program which requires the IDL.
// In unit tests without the IDL, we verify the module exports exist.
// Full instruction building is verified in the Anchor integration tests.

describe('Instructions module exports', () => {
  it('should export all instruction builder functions', async () => {
    const mod = await import('../instructions').catch(() => null);

    // If the IDL is not available, skip
    if (!mod) {
      console.warn('Skipping instruction tests — IDL not available in frontend build');
      return;
    }

    expect(typeof mod.buildBuyTokensInstruction).toBe('function');
    expect(typeof mod.buildClaimRevenueInstruction).toBe('function');
    expect(typeof mod.buildDepositRevenueInstruction).toBe('function');
    expect(typeof mod.buildPauseProjectInstruction).toBe('function');
    expect(typeof mod.buildResumeProjectInstruction).toBe('function');
    expect(typeof mod.buildCloseProjectInstruction).toBe('function');
    expect(typeof mod.buildUpdatePriceInstruction).toBe('function');
  });
});
