import { before, describe, test } from "node:test";
import assert from "node:assert";
import { connect, SOL } from "solana-kite";
import { type Address, type TransactionSigner, generateKeyPairSigner } from "@solana/kit";
import {
  getInitializeProjectInstructionAsync,
  fetchProjectState,
  findProjectStatePda,
} from "../sdk/generated/src/generated";

const connection = connect("localnet");

// Test parameters for a valid project
const TRANSFER_HOOK_PROGRAM_ID =
  "CgbtcZvWngGWNH2uQa8vXfiNSYGpQKVNdx7wDUuMFqmC" as Address;

function futureDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
}

function pastDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago
}

async function buildValidParams(
  admin: TransactionSigner,
  mint: TransactionSigner,
  overrides: Record<string, unknown> = {},
) {
  const oracleKeypair = await generateKeyPairSigner();
  return {
    admin,
    mint,
    carCostLamports: 10n * SOL,
    pricePerShareLamports: SOL / 10n, // 0.1 SOL per share → 100 shares
    minRaiseLamports: 5n * SOL,
    deadline: futureDeadline(),
    transferHookProgramId: TRANSFER_HOOK_PROGRAM_ID,
    oraclePubkey: oracleKeypair.address,
    tokenName: "Axel Taxi #001",
    tokenSymbol: "AXEL",
    tokenUri: "https://arweave.net/test-metadata",
    vin: "XTA210990Y2856777",
    make: "Toyota",
    model: "Camry",
    year: 2023,
    valuationSol: 10n * SOL,
    ...overrides,
  };
}

describe("initialize_project", () => {
  let admin: TransactionSigner;

  before(async () => {
    admin = await connection.createWallet(10n * SOL);
  });

  test("happy path — creates project with correct state", async () => {
    const mint = await generateKeyPairSigner();
    const params = await buildValidParams(admin, mint);

    const instruction = await getInitializeProjectInstructionAsync(params);

    await connection.sendTransactionFromInstructions({
      feePayer: admin,
      instructions: [instruction],
      signers: [admin, mint],
    });

    // Fetch and verify ProjectState
    const [projectStatePda] = await findProjectStatePda({ mint: mint.address });
    const projectState = await fetchProjectState(connection.rpc, projectStatePda);

    assert.strictEqual(projectState.data.admin, admin.address);
    assert.strictEqual(projectState.data.mint, mint.address);
    assert.strictEqual(projectState.data.tokenSupply, 100n); // 10 SOL / 0.1 SOL
    assert.strictEqual(projectState.data.pricePerShare, SOL / 10n);
    assert.strictEqual(projectState.data.minRaise, 5n * SOL);
    assert.strictEqual(projectState.data.maxRaise, 10n * SOL); // 100 * 0.1 SOL
    assert.strictEqual(projectState.data.solRaised, 0n);
    assert.strictEqual(projectState.data.status.__kind, "Fundraising");
    assert.strictEqual(projectState.data.periodCount, 0);
  });

  test("fails with zero price per share", async () => {
    const mint = await generateKeyPairSigner();
    const params = await buildValidParams(admin, mint, {
      pricePerShareLamports: 0n,
    });

    const instruction = await getInitializeProjectInstructionAsync(params);

    await assert.rejects(
      () =>
        connection.sendTransactionFromInstructions({
          feePayer: admin,
          instructions: [instruction],
          signers: [admin, mint],
        }),
      (error: Error) => {
        assert.ok(
          error.message.includes("0x1771"), // 6001 = ZeroPricePerShare
          `Expected error 0x1771 (ZeroPricePerShare), got: ${error.message}`,
        );
        return true;
      },
    );
  });

  test("fails when car cost is not divisible by price per share", async () => {
    const mint = await generateKeyPairSigner();
    const params = await buildValidParams(admin, mint, {
      carCostLamports: 10n * SOL + 1n, // not divisible by 0.1 SOL
    });

    const instruction = await getInitializeProjectInstructionAsync(params);

    await assert.rejects(
      () =>
        connection.sendTransactionFromInstructions({
          feePayer: admin,
          instructions: [instruction],
          signers: [admin, mint],
        }),
      (error: Error) => {
        assert.ok(
          error.message.includes("0x1770"), // 6000 = InvalidTokenSupplyDivision
          `Expected error 0x1770 (InvalidTokenSupplyDivision), got: ${error.message}`,
        );
        return true;
      },
    );
  });

  test("fails when deadline is in the past", async () => {
    const mint = await generateKeyPairSigner();
    const params = await buildValidParams(admin, mint, {
      deadline: pastDeadline(),
    });

    const instruction = await getInitializeProjectInstructionAsync(params);

    await assert.rejects(
      () =>
        connection.sendTransactionFromInstructions({
          feePayer: admin,
          instructions: [instruction],
          signers: [admin, mint],
        }),
      (error: Error) => {
        assert.ok(
          error.message.includes("0x1773"), // 6003 = DeadlineInPast
          `Expected error 0x1773 (DeadlineInPast), got: ${error.message}`,
        );
        return true;
      },
    );
  });
});
