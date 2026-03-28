import { Connection, PublicKey } from '@solana/web3.js';
import {
  ProjectState,
  InvestorRecord,
  WhitelistEntry,
  RevenuePeriod,
  ClaimRecord,
} from '@/types';

/**
 * TODO: Real layout deserialization will be implemented when IDL is provided by Dev B.
 * Currently, we query the accounts to handle RPC/null states but return mock data to unblock UI dev.
 */

/**
 * Fetches and deserializes the state of a Project PDA.
 *
 * @param connection - Solana RPC Connection
 * @param projectPda - PDA of the project
 * @returns ProjectState or null if not found
 */
export async function fetchProjectState(
  connection: Connection,
  projectPda: PublicKey
): Promise<ProjectState | null> {
  try {
    const accountInfo = await connection.getAccountInfo(projectPda);

    if (!accountInfo) {
      console.warn(`ProjectState account not found for PDA: ${projectPda.toBase58()}`);
      // Returning mock instead of null temporarily unblocks UI testing
      // return null; 
    }

    // TODO: Deserialize accountInfo.data using layout/Borsh

    // Mock data for UI development
    return {
      admin: PublicKey.default.toBase58(),
      mint: PublicKey.default.toBase58(),
      escrowVault: PublicKey.default.toBase58(),
      revenueVault: PublicKey.default.toBase58(),
      status: 'fundraising',
      totalTokenSupply: 100000,
      tokensRemaining: 45000,
      pricePerToken: 10000000, // 0.01 SOL
      minInvestment: 50000000, // 0.05 SOL
      maxInvestment: 500000000, // 0.5 SOL
      solRaised: 550000000, // 5.5 SOL
      minRaise: 1000000000, // 10 SOL
      maxRaise: 2000000000, // 20 SOL
      deadline: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
      investorCount: 12,
      carMake: 'Tesla',
      carModel: 'Model S',
      carYear: 2024,
      vin: '5YJS123456789ABCD',
      licensePlate: '01 123 ASD',
      imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?q=80&w=2071&auto=format&fit=crop',
    };
  } catch (error) {
    console.error(`RPC Error fetching ProjectState:`, error);
    return null;
  }
}

/**
 * Fetches and deserializes an Investor's Record PDA.
 *
 * @param connection - Solana RPC Connection
 * @param pda - PDA of the investor record
 * @returns InvestorRecord or null if not found
 */
export async function fetchInvestorRecord(
  connection: Connection,
  pda: PublicKey
): Promise<InvestorRecord | null> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);

    if (!accountInfo) {
      console.warn(`InvestorRecord account not found for PDA: ${pda.toBase58()}`);
      // return null;
    }

    // TODO: Deserialize accountInfo.data

    return {
      wallet: PublicKey.default.toBase58(),
      projectPda: PublicKey.default.toBase58(),
      solInvested: 150000000, // 0.15 SOL
      tokensMinted: 15,
    };
  } catch (error) {
    console.error(`RPC Error fetching InvestorRecord:`, error);
    return null;
  }
}

/**
 * Fetches and deserializes a Whitelist Entry PDA.
 *
 * @param connection - Solana RPC Connection
 * @param pda - PDA of the whitelist entry
 * @returns WhitelistEntry or null if not found
 */
export async function fetchWhitelistEntry(
  connection: Connection,
  pda: PublicKey
): Promise<WhitelistEntry | null> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);

    if (!accountInfo) {
      console.warn(`WhitelistEntry account not found for PDA: ${pda.toBase58()}`);
      // return null;
    }

    // TODO: Deserialize accountInfo.data

    return {
      wallet: PublicKey.default.toBase58(),
      approved: true,
    };
  } catch (error) {
    console.error(`RPC Error fetching WhitelistEntry:`, error);
    return null;
  }
}

/**
 * Fetches all Revenue Periods for a specific project.
 * Uses getProgramAccounts with memcmp filtering.
 *
 * @param connection - Solana RPC Connection
 * @param programId - Smart contract program ID
 * @param projectPda - PDA of the target project
 * @returns Array of RevenuePeriods
 */
export async function fetchAllRevenuePeriods(
  connection: Connection,
  programId: PublicKey,
  projectPda: PublicKey
): Promise<RevenuePeriod[]> {
  try {
    // TODO: Use actual getProgramAccounts RPC call once layouts and size are known.
    /*
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: REVENUE_PERIOD_SIZE },
        { memcmp: { offset: PROJECT_PUBKEY_OFFSET, bytes: projectPda.toBase58() } }
      ]
    });
    */

    // Returning mock data to unblock UI
    return [
      {
        index: 1,
        projectPda: projectPda.toBase58(),
        periodLabel: 'Q1 2026',
        totalDeposited: 1200000000, // 1.2 SOL
        tokenSupplySnapshot: 100000,
        depositTxSignature: 'mock_tx_sig_v1',
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 5,
      },
      {
        index: 2,
        projectPda: projectPda.toBase58(),
        periodLabel: 'Q2 2026',
        totalDeposited: 1500000000, // 1.5 SOL
        tokenSupplySnapshot: 100000,
        depositTxSignature: 'mock_tx_sig_v2',
        createdAt: Math.floor(Date.now() / 1000) - 86400 * 2,
      }
    ];
  } catch (error) {
    console.error(`RPC Error fetching RevenuePeriods:`, error);
    return [];
  }
}

/**
 * Fetches a specific Claim Record PDA.
 *
 * @param connection - Solana RPC Connection
 * @param pda - PDA of the claim record
 * @returns ClaimRecord or null if not found
 */
export async function fetchClaimRecord(
  connection: Connection,
  pda: PublicKey
): Promise<ClaimRecord | null> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);

    if (!accountInfo) {
      console.warn(`ClaimRecord account not found for PDA: ${pda.toBase58()}`);
      // return null;
    }

    // TODO: Deserialize accountInfo.data

    return {
      wallet: PublicKey.default.toBase58(),
      periodIndex: 1,
      amountClaimed: 12000000, // 0.012 SOL
      claimTxSignature: 'mock_claim_tx_sig',
      claimedAt: Math.floor(Date.now() / 1000) - 86400,
    };
  } catch (error) {
    console.error(`RPC Error fetching ClaimRecord:`, error);
    return null;
  }
}

/**
 * Fetches all Claim Records for a specific wallet across the program.
 * Uses getProgramAccounts with memcmp filtering.
 *
 * @param connection - Solana RPC Connection
 * @param programId - Smart contract program ID
 * @param wallet - Wallet pubkey to filter by
 * @returns Array of ClaimRecords
 */
export async function fetchAllClaimRecords(
  connection: Connection,
  programId: PublicKey,
  wallet: PublicKey
): Promise<ClaimRecord[]> {
  try {
    // TODO: Use actual getProgramAccounts RPC call once layouts and size are known.
    /*
    const accounts = await connection.getProgramAccounts(programId, {
      filters: [
        { dataSize: CLAIM_RECORD_SIZE },
        { memcmp: { offset: WALLET_PUBKEY_OFFSET, bytes: wallet.toBase58() } }
      ]
    });
    */

    return [
      {
        wallet: wallet.toBase58(),
        periodIndex: 1,
        amountClaimed: 12000000, // 0.012 SOL
        claimTxSignature: 'mock_claim_tx_sig_1',
        claimedAt: Math.floor(Date.now() / 1000) - 86400 * 4,
      }
    ];
  } catch (error) {
    console.error(`RPC Error fetching all ClaimRecords:`, error);
    return [];
  }
}
