// @vitest-environment node
import { PublicKey, TransactionInstruction, Keypair } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import {
  buildClaimRevenueInstruction,
  buildDepositRevenueInstruction,
  buildInvestInstruction,
  buildPauseProjectInstruction,
} from '../instructions';

describe('Instruction Builders', () => {
  const DUMMY_WALLET = Keypair.generate().publicKey;
  const DUMMY_PROJECT = Keypair.generate().publicKey;
  const DUMMY_RECORD = Keypair.generate().publicKey;
  const DUMMY_PERIOD = Keypair.generate().publicKey;
  const DUMMY_CLAIM = Keypair.generate().publicKey;

  it('should build Invest Instruction correctly', () => {
    const ix = buildInvestInstruction({
      userWallet: DUMMY_WALLET,
      projectPda: DUMMY_PROJECT,
      investorRecordPda: DUMMY_RECORD,
      amount: 100,
    });

    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].pubkey.toBase58()).toBe(DUMMY_WALLET.toBase58());
    expect(ix.keys[0].isSigner).toBe(true);
  });

  it('should build Claim Revenue Instruction correctly', () => {
    const ix = buildClaimRevenueInstruction({
      userWallet: DUMMY_WALLET,
      projectPda: DUMMY_PROJECT,
      revenuePeriodPda: DUMMY_PERIOD,
      claimRecordPda: DUMMY_CLAIM,
      investorRecordPda: DUMMY_RECORD,
    });

    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.keys).toHaveLength(5);
    expect(ix.keys[0].isSigner).toBe(true);
  });

  it('should build Deposit Revenue Instruction correctly', () => {
    const ix = buildDepositRevenueInstruction({
      adminWallet: DUMMY_WALLET,
      projectPda: DUMMY_PROJECT,
      revenuePeriodPda: DUMMY_PERIOD,
      amount: 5000,
      periodId: 1,
    });

    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].isSigner).toBe(true);
  });

  it('should build Pause Project Instruction correctly', () => {
    const ix = buildPauseProjectInstruction({
      adminWallet: DUMMY_WALLET,
      projectPda: DUMMY_PROJECT,
    });

    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.keys).toHaveLength(2);
    expect(ix.keys[0].isSigner).toBe(true);
  });
});
