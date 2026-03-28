import { PublicKey } from '@solana/web3.js';

/**
 * TODO: Real PDA derivation seeds will be provided by Dev B (Smart Contract Developer).
 * The current seeds are placeholders for frontend development.
 */

/**
 * Derives the PDA for a Project State.
 * 
 * @param programId - The smart contract program ID
 * @param projectSeed - A unique identifier/seed for the project
 * @returns The PDA PublicKey and bump seed
 */
export function deriveProjectState(
  programId: PublicKey,
  projectSeed: string
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('project'), // TODO: placeholder seed
      Buffer.from(projectSeed)
    ],
    programId
  );
}

/**
 * Derives the PDA for an Investor's Record within a specific project.
 * 
 * @param programId - The smart contract program ID
 * @param projectPda - The PDA of the project
 * @param walletPubkey - The public key of the investor's wallet
 * @returns The PDA PublicKey and bump seed
 */
export function deriveInvestorRecord(
  programId: PublicKey,
  projectPda: PublicKey,
  walletPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('investor'), // TODO: placeholder seed
      projectPda.toBuffer(),
      walletPubkey.toBuffer()
    ],
    programId
  );
}

/**
 * Derives the PDA for a Whitelist Entry for a specific project.
 * 
 * @param programId - The smart contract program ID
 * @param projectPda - The PDA of the project
 * @param walletPubkey - The public key of the user being whitelisted
 * @returns The PDA PublicKey and bump seed
 */
export function deriveWhitelistEntry(
  programId: PublicKey,
  projectPda: PublicKey,
  walletPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('whitelist'), // TODO: placeholder seed
      projectPda.toBuffer(),
      walletPubkey.toBuffer()
    ],
    programId
  );
}

/**
 * Derives the PDA for a Revenue Period of a project.
 * 
 * @param programId - The smart contract program ID
 * @param projectPda - The PDA of the project
 * @param periodIndex - The index or ID of the specific revenue period
 * @returns The PDA PublicKey and bump seed
 */
export function deriveRevenuePeriod(
  programId: PublicKey,
  projectPda: PublicKey,
  periodIndex: number
): [PublicKey, number] {
  // Convert periodIndex to an 8-byte LE buffer, assuming u64 representation on-chain
  const periodBuffer = Buffer.alloc(8);
  periodBuffer.writeBigUInt64LE(BigInt(periodIndex), 0);

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('revenue_period'), // TODO: placeholder seed
      projectPda.toBuffer(),
      periodBuffer
    ],
    programId
  );
}

/**
 * Derives the PDA for a Claim Record by an investor for a specific revenue period.
 * 
 * @param programId - The smart contract program ID
 * @param periodPda - The PDA of the revenue period
 * @param walletPubkey - The public key of the investor claiming revenue
 * @returns The PDA PublicKey and bump seed
 */
export function deriveClaimRecord(
  programId: PublicKey,
  periodPda: PublicKey,
  walletPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('claim_record'), // TODO: placeholder seed
      periodPda.toBuffer(),
      walletPubkey.toBuffer()
    ],
    programId
  );
}
