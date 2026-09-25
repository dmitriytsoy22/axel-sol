import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expectError, expectEvent, expectOk, type ErrorName } from "./helpers/assert";
import { bn, TestEnv } from "./helpers/env";
import { configuredEnv, DAY, type Roles } from "./helpers/fixtures";
import {
  InvestorFlag,
  InvestorStatus,
  KycProvider,
  setInvestorIx,
  updateConfigIx,
  type SetInvestorParams,
} from "./helpers/instructions";
import { investorAddress, investorPda } from "./helpers/pda";
import { plain } from "./helpers/plain";

const KAZAKHSTAN = 398;
const INVESTOR_SPACE = 62n;

/** What the backend writes after a green Sumsub review: active for a year. */
function verifiedParams(env: TestEnv): SetInvestorParams {
  return {
    status: InvestorStatus.active,
    expiresAt: bn(env.now() + 365n * DAY),
    jurisdiction: KAZAKHSTAN,
    flags: 0,
    provider: KycProvider.sumsub,
  };
}

/** What the demo access route writes: DEMO flag, 30 days. */
function demoParams(env: TestEnv): SetInvestorParams {
  return {
    status: InvestorStatus.active,
    expiresAt: bn(env.now() + 30n * DAY),
    jurisdiction: KAZAKHSTAN,
    flags: InvestorFlag.demo,
    provider: KycProvider.demo,
  };
}

async function setInvestor(env: TestEnv, signer: Keypair, wallet: PublicKey, params: SetInvestorParams) {
  return env.send([await setInvestorIx(signer.publicKey, wallet, params)], [signer]);
}

describe("set_investor by the KYC authority", () => {
  test("registers an active investor, emits InvestorUpdated and pays the rent", async () => {
    const { env, roles } = await configuredEnv();
    const wallet = Keypair.generate().publicKey;
    const params = verifiedParams(env);
    const [address, bump] = investorAddress(wallet);
    const rent = env.svm.minimumBalanceForRentExemption(INVESTOR_SPACE);
    const kycBalanceBefore = env.balance(roles.kyc.publicKey);

    const result = expectOk(await setInvestor(env, roles.kyc, wallet, params));

    assert.deepEqual(
      plain(env.fetch("investor", address)),
      plain({ wallet, ...params, updatedAt: bn(env.now()), bump }),
    );
    assert.deepEqual(
      plain(expectEvent(result, "investorUpdated")),
      plain({
        wallet,
        status: params.status,
        flags: params.flags,
        jurisdiction: params.jurisdiction,
        expiresAt: params.expiresAt,
        provider: params.provider,
        authority: roles.kyc.publicKey,
      }),
    );
    assert.equal(env.balance(address), rent);
    assert.ok(kycBalanceBefore - env.balance(roles.kyc.publicKey) >= rent);
  });

  test("revokes and then freezes an existing investor", async () => {
    const { env, roles } = await configuredEnv();
    const wallet = Keypair.generate().publicKey;
    expectOk(await setInvestor(env, roles.kyc, wallet, verifiedParams(env)));

    env.warp(DAY);
    const revoked = { ...verifiedParams(env), status: InvestorStatus.revoked, expiresAt: bn(0) };
    expectOk(await setInvestor(env, roles.kyc, wallet, revoked));
    assert.deepEqual(
      plain(env.fetch("investor", investorPda(wallet))),
      plain({ wallet, ...revoked, updatedAt: bn(env.now()), bump: investorAddress(wallet)[1] }),
    );

    env.warp(DAY);
    const frozen = { ...verifiedParams(env), status: InvestorStatus.frozen };
    expectOk(await setInvestor(env, roles.kyc, wallet, frozen));
    assert.deepEqual(
      plain(env.fetch("investor", investorPda(wallet))),
      plain({ wallet, ...frozen, updatedAt: bn(env.now()), bump: investorAddress(wallet)[1] }),
    );
  });

  test("the investor account must be the PDA of the wallet", async () => {
    const { env, roles } = await configuredEnv();
    const wallet = Keypair.generate().publicKey;
    const otherPda = investorPda(Keypair.generate().publicKey);

    expectError(
      env.send(
        [await setInvestorIx(roles.kyc.publicKey, wallet, verifiedParams(env), otherPda)],
        [roles.kyc],
      ),
      "ConstraintSeeds",
    );

    assert.equal(env.exists(otherPda), false);
  });

  const invalidRecords: Array<{
    description: string;
    wallet?: PublicKey;
    change: (env: TestEnv) => Partial<SetInvestorParams>;
    error: ErrorName;
  }> = [
    { description: "status None", change: () => ({ status: InvestorStatus.none }), error: "InvalidInvestorStatus" },
    { description: "an unknown flag bit", change: () => ({ flags: 8 }), error: "InvalidInvestorFlags" },
    { description: "a jurisdiction above 999", change: () => ({ jurisdiction: 1_000 }), error: "InvalidJurisdiction" },
    {
      description: "an active status that expires now",
      change: (env) => ({ expiresAt: bn(env.now()) }),
      error: "InvalidExpiry",
    },
    { description: "the default wallet", wallet: PublicKey.default, change: () => ({}), error: "InvalidAddress" },
  ];

  for (const { description, wallet = Keypair.generate().publicKey, change, error } of invalidRecords) {
    test(`rejects ${description} with ${error}`, async () => {
      const { env, roles } = await configuredEnv();

      expectError(
        await setInvestor(env, roles.kyc, wallet, { ...verifiedParams(env), ...change(env) }),
        error,
      );

      assert.equal(env.exists(investorPda(wallet)), false);
    });
  }
});

describe("set_investor rejects signers without a KYC role", () => {
  test("a wallet cannot approve its own KYC", async () => {
    const { env } = await configuredEnv();
    const investor = env.newAccount();

    expectError(await setInvestor(env, investor, investor.publicKey, verifiedParams(env)), "Unauthorized");

    assert.equal(env.exists(investorPda(investor.publicKey)), false);
  });

  test("an outsider cannot revoke another investor", async () => {
    const { env, roles } = await configuredEnv();
    const victim = Keypair.generate().publicKey;
    const attacker = env.newAccount();
    expectOk(await setInvestor(env, roles.kyc, victim, verifiedParams(env)));
    const before = plain(env.fetch("investor", investorPda(victim)));

    expectError(
      await setInvestor(env, attacker, victim, { ...verifiedParams(env), status: InvestorStatus.revoked }),
      "Unauthorized",
    );

    assert.deepEqual(plain(env.fetch("investor", investorPda(victim))), before);
  });

  const nonKycRoles: Array<[string, (env: TestEnv, roles: Roles) => Keypair]> = [
    ["the admin", (_, roles) => roles.admin],
    ["the upgrade authority", (env) => env.upgradeAuthority],
    ["the treasury", (_, roles) => roles.treasury],
  ];

  for (const [description, signerOf] of nonKycRoles) {
    test(`${description} cannot write KYC records`, async () => {
      const { env, roles } = await configuredEnv();
      const wallet = Keypair.generate().publicKey;

      expectError(await setInvestor(env, signerOf(env, roles), wallet, verifiedParams(env)), "Unauthorized");

      assert.equal(env.exists(investorPda(wallet)), false);
    });
  }

  test("a rotated-out KYC key loses its rights and the new key gains them", async () => {
    const { env, roles } = await configuredEnv();
    const newKyc = env.newAccount();
    expectOk(env.send([await updateConfigIx(roles.admin.publicKey, { kycAuthority: newKyc.publicKey })], [roles.admin]));
    const wallet = Keypair.generate().publicKey;

    expectError(await setInvestor(env, roles.kyc, wallet, verifiedParams(env)), "Unauthorized");
    expectOk(await setInvestor(env, newKyc, wallet, verifiedParams(env)));

    assert.deepEqual(plain(env.fetch("investor", investorPda(wallet)).status), plain(InvestorStatus.active));
  });
});

describe("set_investor by the demo KYC authority", () => {
  test("grants DEMO access for exactly the 30 day maximum", async () => {
    const { env, roles } = await configuredEnv();
    const wallet = Keypair.generate().publicKey;
    const params = demoParams(env);

    const result = expectOk(await setInvestor(env, roles.demoKyc, wallet, params));

    assert.deepEqual(
      plain(env.fetch("investor", investorPda(wallet))),
      plain({ wallet, ...params, updatedAt: bn(env.now()), bump: investorAddress(wallet)[1] }),
    );
    assert.deepEqual(plain(expectEvent(result, "investorUpdated").authority), plain(roles.demoKyc.publicKey));
  });

  test("updates and revokes its own DEMO records", async () => {
    const { env, roles } = await configuredEnv();
    const wallet = Keypair.generate().publicKey;
    expectOk(await setInvestor(env, roles.demoKyc, wallet, demoParams(env)));

    env.warp(DAY);
    const revoked = { ...demoParams(env), status: InvestorStatus.revoked };
    expectOk(await setInvestor(env, roles.demoKyc, wallet, revoked));

    assert.deepEqual(
      plain(env.fetch("investor", investorPda(wallet))),
      plain({ wallet, ...revoked, updatedAt: bn(env.now()), bump: investorAddress(wallet)[1] }),
    );
  });

  const outOfScope: Array<[string, (env: TestEnv) => Partial<SetInvestorParams>, ErrorName]> = [
    ["without the DEMO flag", () => ({ flags: 0 }), "DemoScopeViolation"],
    ["with the QUALIFIED flag", () => ({ flags: InvestorFlag.demo | InvestorFlag.qualified }), "DemoScopeViolation"],
    ["with the PROGRAM flag", () => ({ flags: InvestorFlag.demo | InvestorFlag.program }), "DemoScopeViolation"],
    ["as the Sumsub provider", () => ({ provider: KycProvider.sumsub }), "DemoScopeViolation"],
    ["for one second longer than 30 days", (env) => ({ expiresAt: bn(env.now() + 30n * DAY + 1n) }), "DemoExpiryTooLong"],
  ];

  for (const [description, change, error] of outOfScope) {
    test(`cannot grant access ${description} (${error})`, async () => {
      const { env, roles } = await configuredEnv();
      const wallet = Keypair.generate().publicKey;

      expectError(await setInvestor(env, roles.demoKyc, wallet, { ...demoParams(env), ...change(env) }), error);

      assert.equal(env.exists(investorPda(wallet)), false);
    });
  }

  const overwrites: Array<[string, (env: TestEnv) => SetInvestorParams]> = [
    ["revoke", (env) => ({ ...demoParams(env), status: InvestorStatus.revoked })],
    ["downgrade to DEMO", (env) => demoParams(env)],
  ];

  for (const [action, paramsOf] of overwrites) {
    test(`cannot ${action} a record written by the KYC authority`, async () => {
      const { env, roles } = await configuredEnv();
      const wallet = Keypair.generate().publicKey;
      expectOk(await setInvestor(env, roles.kyc, wallet, verifiedParams(env)));
      const before = plain(env.fetch("investor", investorPda(wallet)));

      expectError(await setInvestor(env, roles.demoKyc, wallet, paramsOf(env)), "DemoRecordImmutable");

      assert.deepEqual(plain(env.fetch("investor", investorPda(wallet))), before);
    });
  }

  test("a disabled demo key cannot sign", async () => {
    const { env, roles } = await configuredEnv();
    expectOk(
      env.send([await updateConfigIx(roles.admin.publicKey, { demoKycAuthority: PublicKey.default })], [roles.admin]),
    );
    const wallet = Keypair.generate().publicKey;

    expectError(await setInvestor(env, roles.demoKyc, wallet, demoParams(env)), "Unauthorized");

    assert.equal(env.exists(investorPda(wallet)), false);
  });
});
