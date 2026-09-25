/**
 * Runs a small market on the real axel_v2 program in LiteSVM and writes the resulting
 * accounts to the frontend, so its readers, math and transfer-hook tests work on bytes the
 * program produced rather than on hand-made ones.
 *
 *   npm run build && npm --prefix tests-v2 run export-frontend-fixture
 *
 * The run: a Token-2022 test tenge with on-chain metadata, one operating car with three
 * deposits, transfers and a claim between them, one raise in progress and one cancelled
 * raise. After the snapshot every holder of the operating car claims, and the amounts the
 * program paid are recorded next to the accounts.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  ExtensionType,
  getMintLen,
  LENGTH_SIZE,
  TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expectOk } from "../helpers/assert";
import { bn, PROGRAM_ID, TestEnv } from "../helpers/env";
import {
  buy,
  claim,
  configParams,
  DAY,
  deposit,
  newInvestor,
  newRoles,
  onboard,
  openProject,
  operatingProject,
  transfer,
  type Market,
} from "../helpers/fixtures";
import { cancelRaiseIx, initializeConfigIx, type ProjectRef } from "../helpers/instructions";
import {
  configPda,
  extraAccountMetasAddress,
  investorPda,
  periodPda,
  positionPda,
} from "../helpers/pda";
import { ata, PAYMENT_DECIMALS, TOKEN_2022_PROGRAM_ID, tokenBalance } from "../helpers/tokens";

const OUTPUT = fileURLToPath(
  new URL("../../frontend/src/lib/solana/__tests__/fixtures/chain.json", import.meta.url),
);

/** A Token-2022 payment mint that names itself "tKZT" in its own metadata. */
function createTestTenge(env: TestEnv, issuer: Keypair): PublicKey {
  const mint = Keypair.generate();
  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    updateAuthority: issuer.publicKey,
    name: "Test Tenge",
    symbol: "tKZT",
    uri: "",
    additionalMetadata: [],
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const fullLen = mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  expectOk(
    env.send(
      [
        SystemProgram.createAccount({
          fromPubkey: issuer.publicKey,
          newAccountPubkey: mint.publicKey,
          space: mintLen,
          lamports: Number(env.svm.minimumBalanceForRentExemption(BigInt(fullLen))),
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeMetadataPointerInstruction(mint.publicKey, issuer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeMint2Instruction(mint.publicKey, PAYMENT_DECIMALS, issuer.publicKey, issuer.publicKey, TOKEN_2022_PROGRAM_ID),
        createInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          metadata: mint.publicKey,
          updateAuthority: issuer.publicKey,
          mint: mint.publicKey,
          mintAuthority: issuer.publicKey,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
        }),
      ],
      [issuer, mint],
    ),
  );
  return mint.publicKey;
}

async function testTengeMarket(): Promise<Market> {
  const env = new TestEnv();
  const roles = newRoles(env);
  const issuer = env.newAccount();
  const paymentMint = createTestTenge(env, issuer);
  expectOk(
    env.send(
      [await initializeConfigIx(env.upgradeAuthority.publicKey, configParams(roles, paymentMint))],
      [env.upgradeAuthority],
    ),
  );
  return {
    env,
    roles,
    issuer,
    paymentMint,
    paymentProgram: TOKEN_2022_PROGRAM_ID,
    operator: env.newAccount(),
    oracle: env.newAccount(),
  };
}

function projectAccounts(project: ProjectRef, wallets: PublicKey[], periodCount: number): PublicKey[] {
  return [
    project.address,
    project.shareMint,
    project.escrow,
    project.revenue,
    extraAccountMetasAddress(project.shareMint)[0],
    ...wallets.flatMap((wallet) => [
      positionPda(project.address, wallet),
      ata(wallet, project.shareMint, TOKEN_2022_PROGRAM_ID),
    ]),
    ...Array.from({ length: periodCount }, (_, index) => periodPda(project.address, index)),
  ];
}

const keys = (wallets: Keypair[]) => wallets.map((wallet) => wallet.publicKey.toBase58());

async function main(): Promise<void> {
  const market = await testTengeMarket();
  const { env } = market;

  // A car on the road: three holders, deposits around transfers, one claim in between.
  const { project: operating, holders } = await operatingProject(market, [50n, 30n, 20n], {
    name: "AXEL Kia Rio #017",
    symbol: "AXKR017",
  });
  // One deposit a month, each a few days after the month it covers.
  env.warp(35n * DAY);
  expectOk(await deposit(market, operating, 1_234_567_891n));
  expectOk(transfer(market, operating, holders[0], holders[2].publicKey, 7n));
  const newcomer = await onboard(market, operating, holders[1]);
  expectOk(transfer(market, operating, holders[1], newcomer.publicKey, 3n));
  env.warp(30n * DAY);
  expectOk(await deposit(market, operating, 987_654_321n, { periodStart: 20261101, periodEnd: 20261130 }));
  expectOk(await claim(market, operating, holders[0]));
  env.warp(31n * DAY);
  expectOk(await deposit(market, operating, 555_555_557n, { periodStart: 20261201, periodEnd: 20261231 }));
  const operatingHolders = [...holders, newcomer];

  // A raise in progress and a cancelled one.
  const raising = await openProject(market, {
    name: "AXEL Hyundai Accent #003",
    symbol: "AXHA003",
    softCapShares: bn(60n),
    additionalMetadata: [
      { key: "make", value: "Hyundai" },
      { key: "model", value: "Accent" },
      { key: "year", value: "2023" },
      { key: "city", value: "Astana" },
      { key: "class", value: "economy" },
    ],
  });
  const raiser = await newInvestor(market);
  expectOk(await buy(market, raising, raiser, 12n));

  const cancelled = await openProject(market, {
    name: "AXEL Chevrolet Onix #009",
    symbol: "AXCO009",
    additionalMetadata: [
      { key: "make", value: "Chevrolet" },
      { key: "model", value: "Onix" },
      { key: "year", value: "2024" },
      { key: "city", value: "Shymkent" },
    ],
  });
  const refunder = await newInvestor(market);
  expectOk(await buy(market, cancelled, refunder, 5n));
  expectOk(env.send([await cancelRaiseIx(cancelled, market.roles.admin.publicKey)], [market.roles.admin]));

  // A wallet that never passed KYC.
  const stranger = env.newAccount();

  const wallets = [...operatingHolders, raiser, refunder, stranger].map((wallet) => wallet.publicKey);
  const addresses = [
    configPda(),
    market.paymentMint,
    ...wallets.flatMap((wallet) => [investorPda(wallet), ata(wallet, market.paymentMint, TOKEN_2022_PROGRAM_ID)]),
    ...projectAccounts(operating, wallets, env.fetch("project", operating.address).periodCount),
    ...projectAccounts(raising, wallets, 0),
    ...projectAccounts(cancelled, wallets, 0),
  ];
  const accounts = addresses.flatMap((address) => {
    const account = env.svm.getAccount(address);
    return account === null
      ? []
      : [
          {
            address: address.toBase58(),
            owner: account.owner.toBase58(),
            lamports: account.lamports,
            data: Buffer.from(account.data).toString("base64"),
          },
        ];
  });

  // What a claim pays each holder right after the snapshot.
  const claims = [];
  for (const holder of operatingHolders) {
    const paymentAccount = ata(holder.publicKey, market.paymentMint, TOKEN_2022_PROGRAM_ID);
    const before = env.exists(paymentAccount) ? tokenBalance(env, paymentAccount) : 0n;
    expectOk(await claim(market, operating, holder));
    claims.push({ owner: holder.publicKey.toBase58(), paid: (tokenBalance(env, paymentAccount) - before).toString() });
  }

  const fixture = {
    generatedBy: "tests-v2/scripts/export-frontend-fixture.ts",
    programId: PROGRAM_ID.toBase58(),
    now: Number(env.now()),
    paymentMint: market.paymentMint.toBase58(),
    admin: market.roles.admin.publicKey.toBase58(),
    kycAuthority: market.roles.kyc.publicKey.toBase58(),
    operator: market.operator.publicKey.toBase58(),
    projects: {
      operating: { shareMint: operating.shareMint.toBase58(), holders: keys(operatingHolders), claims },
      fundraising: { shareMint: raising.shareMint.toBase58(), holders: keys([raiser]) },
      failed: { shareMint: cancelled.shareMint.toBase58(), holders: keys([refunder]) },
    },
    stranger: stranger.publicKey.toBase58(),
    accounts,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Wrote ${accounts.length} accounts to ${OUTPUT}`);
}

await main();
