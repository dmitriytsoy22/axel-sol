// @vitest-environment node
import { PublicKey, Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  deriveClaimRecord,
  deriveInvestorRecord,
  deriveProjectState,
  deriveRevenuePeriod,
  deriveWhitelistEntry,
} from '../pda';

describe('PDA Derivations', () => {
  const PROGRAM_ID = Keypair.generate().publicKey;
  const DUMMY_PROJECT_PDA = Keypair.generate().publicKey;
  const DUMMY_WALLET = Keypair.generate().publicKey;
  const DUMMY_PERIOD_PDA = Keypair.generate().publicKey;

  it('should derive Project State PDA correctly', () => {
    const projectSeed = 'project-123';
    const [pda, bump] = deriveProjectState(PROGRAM_ID, projectSeed);
    
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('should derive Investor Record PDA correctly', () => {
    const [pda, bump] = deriveInvestorRecord(PROGRAM_ID, DUMMY_PROJECT_PDA, DUMMY_WALLET);
    
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
  });

  it('should derive Whitelist Entry PDA correctly', () => {
    const [pda, bump] = deriveWhitelistEntry(PROGRAM_ID, DUMMY_PROJECT_PDA, DUMMY_WALLET);
    
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
  });

  it('should derive Revenue Period PDA correctly', () => {
    const periodIndex = 1;
    const [pda, bump] = deriveRevenuePeriod(PROGRAM_ID, DUMMY_PROJECT_PDA, periodIndex);
    
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
  });

  it('should derive Claim Record PDA correctly', () => {
    const [pda, bump] = deriveClaimRecord(PROGRAM_ID, DUMMY_PERIOD_PDA, DUMMY_WALLET);
    
    expect(pda).toBeInstanceOf(PublicKey);
    expect(typeof bump).toBe('number');
  });
});
