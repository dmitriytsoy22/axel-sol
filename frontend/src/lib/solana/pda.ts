import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './connection';

/**
 * Derives the ProjectState PDA.
 * Seeds: ["project", mint]
 */
export function deriveProjectState(
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('project'), mint.toBuffer()],
    PROGRAM_ID,
  );
}

/**
 * Derives the Revenue Vault PDA (system-owned, holds SOL).
 * Seeds: ["revenue", mint]
 */
export function deriveRevenueVault(
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('revenue'), mint.toBuffer()],
    PROGRAM_ID,
  );
}

/**
 * Derives a WhitelistEntry PDA.
 * Seeds: ["whitelist", wallet]
 */
export function deriveWhitelistEntry(
  wallet: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

/**
 * Derives a RevenuePeriod PDA.
 * Seeds: ["revenue_period", mint, period_index_le]
 */
export function deriveRevenuePeriod(
  mint: PublicKey,
  periodIndex: number,
): [PublicKey, number] {
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32LE(periodIndex);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('revenue_period'), mint.toBuffer(), indexBuffer],
    PROGRAM_ID,
  );
}

/**
 * Derives a ClaimRecord PDA.
 * Seeds: ["claim", revenue_period_pda, wallet]
 */
export function deriveClaimRecord(
  revenuePeriodPda: PublicKey,
  wallet: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('claim'), revenuePeriodPda.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

/**
 * Derives a TelemetryRecord PDA.
 * Seeds: ["telemetry", mint, date_le]
 */
export function deriveTelemetryRecord(
  mint: PublicKey,
  date: number,
): [PublicKey, number] {
  const dateBuffer = Buffer.alloc(4);
  dateBuffer.writeUInt32LE(date);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('telemetry'), mint.toBuffer(), dateBuffer],
    PROGRAM_ID,
  );
}
