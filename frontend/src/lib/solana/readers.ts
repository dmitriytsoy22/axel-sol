import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, getTokenMetadata } from '@solana/spl-token';
import type {
  ProjectState,
  WhitelistEntry,
  RevenuePeriod,
  ClaimRecord,
  InvestorHolding,
} from '@/types';
import { getReadonlyProgram, getConnection } from './connection';
import { deriveProjectState, deriveWhitelistEntry, deriveRevenuePeriod, deriveClaimRecord } from './pda';

/**
 * Fetches and deserializes ProjectState from on-chain.
 * Also reads Token-2022 metadata for car details.
 */
export async function fetchProjectState(
  connection: Connection,
  mint: PublicKey,
): Promise<ProjectState | null> {
  try {
    const program = getReadonlyProgram();
    const [projectStatePda] = deriveProjectState(mint);

    const data = await program.account.projectState.fetch(projectStatePda);

    // Map on-chain status enum to string
    let status: ProjectState['status'] = 'active';
    if ('paused' in data.status) status = 'paused';
    else if ('closed' in data.status) status = 'closed';

    const tokensSold = data.tokensSold.toNumber();
    const totalTokenSupply = data.tokenSupply.toNumber();

    // Read Token-2022 metadata for car details
    let carMake = '';
    let carModel = '';
    let carYear = 0;
    let vin = '';
    let imageUrl = '';

    try {
      const metadata = await getTokenMetadata(
        connection,
        mint,
        'confirmed',
        TOKEN_2022_PROGRAM_ID,
      );
      if (metadata) {
        carMake = findMetadataField(metadata, 'make');
        carModel = findMetadataField(metadata, 'model');
        carYear = parseInt(findMetadataField(metadata, 'year') || '0', 10);
        vin = findMetadataField(metadata, 'vin');
        const uri = metadata.uri || '';
        imageUrl = uri.includes('test-metadata') ? '' : uri;
      }
    } catch (e) {
      console.warn('Failed to read token metadata:', e);
    }

    return {
      admin: data.admin.toBase58(),
      mint: data.mint.toBase58(),
      revenueVault: data.revenueVault.toBase58(),
      status,
      totalTokenSupply,
      tokensSold,
      tokensRemaining: totalTokenSupply - tokensSold,
      pricePerToken: data.pricePerShare.toNumber(),
      periodCount: data.periodCount,
      oraclePubkey: data.oraclePubkey.toBase58(),
      bump: data.bump,
      revenueVaultBump: data.revenueVaultBump,
      carMake,
      carModel,
      carYear,
      vin,
      imageUrl,
    };
  } catch (error) {
    console.error('Error fetching ProjectState:', error);
    return null;
  }
}

/**
 * Fetches ALL ProjectState accounts from on-chain via getProgramAccounts.
 * Enriches each with Token-2022 metadata for car details.
 */
export async function fetchAllProjects(
  connection: Connection,
): Promise<ProjectState[]> {
  const program = getReadonlyProgram();

  // Fetch all ProjectState accounts in one RPC call
  const allAccounts = await program.account.projectState.all();

  const projects: ProjectState[] = [];

  for (const { account: data } of allAccounts) {
    let status: ProjectState['status'] = 'active';
    if ('paused' in data.status) status = 'paused';
    else if ('closed' in data.status) status = 'closed';

    const mint = data.mint;
    const tokensSold = data.tokensSold.toNumber();
    const totalTokenSupply = data.tokenSupply.toNumber();

    // Read Token-2022 metadata
    let carMake = '';
    let carModel = '';
    let carYear = 0;
    let vin = '';
    let imageUrl = '';

    try {
      const metadata = await getTokenMetadata(
        connection,
        mint,
        'confirmed',
        TOKEN_2022_PROGRAM_ID,
      );
      if (metadata) {
        carMake = findMetadataField(metadata, 'make');
        carModel = findMetadataField(metadata, 'model');
        carYear = parseInt(findMetadataField(metadata, 'year') || '0', 10);
        vin = findMetadataField(metadata, 'vin');
        const uri = metadata.uri || '';
        imageUrl = uri.includes('test-metadata') ? '' : uri;
      }
    } catch (e) {
      console.warn(`Failed to read token metadata for mint ${mint.toBase58()}:`, e);
    }

    projects.push({
      admin: data.admin.toBase58(),
      mint: mint.toBase58(),
      revenueVault: data.revenueVault.toBase58(),
      status,
      totalTokenSupply,
      tokensSold,
      tokensRemaining: totalTokenSupply - tokensSold,
      pricePerToken: data.pricePerShare.toNumber(),
      periodCount: data.periodCount,
      oraclePubkey: data.oraclePubkey.toBase58(),
      bump: data.bump,
      revenueVaultBump: data.revenueVaultBump,
      carMake,
      carModel,
      carYear,
      vin,
      imageUrl,
    });
  }

  return projects;
}

/**
 * Fetches whitelist status for a wallet.
 * Returns null if the wallet is not whitelisted.
 */
export async function fetchWhitelistEntry(
  _connection: Connection,
  wallet: PublicKey,
): Promise<WhitelistEntry | null> {
  try {
    const program = getReadonlyProgram();
    const [whitelistPda] = deriveWhitelistEntry(wallet);

    const data = await program.account.whitelistEntry.fetch(whitelistPda);

    return {
      wallet: wallet.toBase58(),
      approved: data.approved,
    };
  } catch {
    // Account doesn't exist = not whitelisted
    return null;
  }
}

/**
 * Fetches investor's token balance from their Token-2022 ATA.
 */
export async function fetchInvestorHolding(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
  totalTokenSupply: number,
): Promise<InvestorHolding | null> {
  try {
    const ata = getAssociatedTokenAddressSync(
      mint,
      wallet,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    const balance = await connection.getTokenAccountBalance(ata);
    const tokenBalance = Number(balance.value.amount);

    if (tokenBalance === 0) return null;

    return {
      wallet: wallet.toBase58(),
      mint: mint.toBase58(),
      tokenBalance,
      ownershipPercentage:
        totalTokenSupply > 0 ? (tokenBalance / totalTokenSupply) * 100 : 0,
    };
  } catch {
    // ATA doesn't exist = no holdings
    return null;
  }
}

/**
 * Fetches all revenue periods for a project by iterating from index 0.
 */
export async function fetchAllRevenuePeriods(
  _connection: Connection,
  mint: PublicKey,
  periodCount: number,
): Promise<RevenuePeriod[]> {
  const program = getReadonlyProgram();
  const periods: RevenuePeriod[] = [];

  for (let i = 0; i < periodCount; i++) {
    try {
      const [periodPda] = deriveRevenuePeriod(mint, i);
      const data = await program.account.revenuePeriod.fetch(periodPda);

      periods.push({
        index: data.periodIndex,
        project: data.project.toBase58(),
        totalDeposited: data.totalDeposited.toNumber(),
        tokenSupplySnapshot: data.tokenSupplySnapshot.toNumber(),
        depositedAt: data.depositedAt.toNumber(),
        bump: data.bump,
        pda: periodPda.toBase58(),
      });
    } catch (e) {
      console.warn(`Failed to fetch revenue period ${i}:`, e);
    }
  }

  return periods;
}

/**
 * Checks if a claim record exists for a wallet + period.
 * Returns the ClaimRecord or null if unclaimed.
 */
export async function fetchClaimRecord(
  _connection: Connection,
  revenuePeriodPda: PublicKey,
  wallet: PublicKey,
): Promise<ClaimRecord | null> {
  try {
    const program = getReadonlyProgram();
    const [claimPda] = deriveClaimRecord(revenuePeriodPda, wallet);

    const data = await program.account.claimRecord.fetch(claimPda);

    return {
      claimed: data.claimed,
      bump: data.bump,
    };
  } catch {
    // Account doesn't exist = not claimed
    return null;
  }
}

/** Helper to find a field in Token-2022 additional metadata */
function findMetadataField(
  metadata: any,
  key: string,
): string {
  if (!metadata.additionalMetadata) return '';
  const entry = metadata.additionalMetadata.find(
    ([k]: [string, string]) => k === key,
  );
  return entry ? entry[1] : '';
}
