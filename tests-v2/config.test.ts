import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  expectCustomError,
  expectError,
  expectEvent,
  expectOk,
  SYSTEM_ACCOUNT_ALREADY_IN_USE,
  type ErrorName,
} from "./helpers/assert";
import { bn, programDataAddress, TestEnv } from "./helpers/env";
import { configParams, configuredEnv, DAY, newRoles, type Roles } from "./helpers/fixtures";
import {
  acceptAdminIx,
  initializeConfigIx,
  proposeAdminIx,
  updateConfigIx,
  type InitializeConfigParams,
  type UpdateConfigParams,
} from "./helpers/instructions";
import { configAddress, configPda } from "./helpers/pda";
import { plain } from "./helpers/plain";

const HOUR = 3_600n;

function eventFields(config: InitializeConfigParams & { paused: boolean }) {
  return {
    admin: config.admin,
    kycAuthority: config.kycAuthority,
    demoKycAuthority: config.demoKycAuthority,
    treasury: config.treasury,
    raiseFeeBps: config.raiseFeeBps,
    revenueFeeBps: config.revenueFeeBps,
    minRaiseDuration: config.minRaiseDuration,
    maxActivationWindow: config.maxActivationWindow,
    allowedPaymentMints: config.allowedPaymentMints,
    paused: config.paused,
    recoveryDelay: config.recoveryDelay,
  };
}

describe("initialize_config", () => {
  test("the upgrade authority creates the config with the given roles and fees", async () => {
    const env = new TestEnv();
    const params = configParams(newRoles(env));

    const result = expectOk(
      env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, params)], [env.upgradeAuthority]),
    );

    const [address, bump] = configAddress();
    assert.deepEqual(
      plain(env.fetch("config", address)),
      plain({
        ...params,
        pendingAdmin: PublicKey.default,
        paused: false,
        projectCount: bn(0),
        bump,
        reserved: new Array(24).fill(0),
      }),
    );
    assert.deepEqual(plain(expectEvent(result, "configUpdated")), plain(eventFields({ ...params, paused: false })));
  });

  test("a signer that is not the upgrade authority cannot front-run the initialization", async () => {
    const env = new TestEnv();
    const attacker = env.newAccount();
    const params = { ...configParams(newRoles(env)), admin: attacker.publicKey };

    expectError(env.send([await initializeConfigIx(attacker.publicKey, params)], [attacker]), "Unauthorized");

    assert.equal(env.exists(configPda()), false);
  });

  test("ProgramData of a program the attacker controls is rejected", async () => {
    const env = new TestEnv();
    const attacker = env.newAccount();
    const attackerProgram = Keypair.generate().publicKey;
    env.deployCopy(attackerProgram, attacker.publicKey);
    const params = { ...configParams(newRoles(env)), admin: attacker.publicKey };

    expectError(
      env.send(
        [await initializeConfigIx(attacker.publicKey, params, programDataAddress(attackerProgram))],
        [attacker],
      ),
      "ConstraintRaw",
    );

    assert.equal(env.exists(configPda()), false);
  });

  test("an immutable program cannot be initialized by its former upgrade authority", async () => {
    const env = new TestEnv({ upgradeAuthority: "none" });
    const params = configParams(newRoles(env));

    expectError(
      env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, params)], [env.upgradeAuthority]),
      "Unauthorized",
    );

    assert.equal(env.exists(configPda()), false);
  });

  test("the config can be initialized only once", async () => {
    const { env, params } = await configuredEnv();
    const takeover = { ...params, admin: env.newAccount().publicKey };

    expectCustomError(
      env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, takeover)], [env.upgradeAuthority]),
      SYSTEM_ACCOUNT_ALREADY_IN_USE,
      "AccountAlreadyInUse",
    );

    assert.deepEqual(plain(env.fetch("config", configPda()).admin), plain(params.admin));
  });

  const invalidSettings: Array<[string, (params: InitializeConfigParams) => void, ErrorName]> = [
    ["a raise fee above 5%", (p) => { p.raiseFeeBps = 501; }, "FeeTooHigh"],
    ["a revenue fee above 20%", (p) => { p.revenueFeeBps = 2_001; }, "FeeTooHigh"],
    ["a zero minimum raise duration", (p) => { p.minRaiseDuration = bn(0); }, "InvalidDuration"],
    ["a negative activation window", (p) => { p.maxActivationWindow = bn(-1); }, "InvalidDuration"],
    ["a recovery delay under one hour", (p) => { p.recoveryDelay = bn(HOUR - 1n); }, "InvalidRecoveryDelay"],
    ["a recovery delay over 30 days", (p) => { p.recoveryDelay = bn(30n * DAY + 1n); }, "InvalidRecoveryDelay"],
    ["the default admin", (p) => { p.admin = PublicKey.default; }, "InvalidAddress"],
    ["the default KYC authority", (p) => { p.kycAuthority = PublicKey.default; }, "InvalidAddress"],
    ["the default treasury", (p) => { p.treasury = PublicKey.default; }, "InvalidAddress"],
    ["a demo KYC key equal to the KYC key", (p) => { p.demoKycAuthority = p.kycAuthority; }, "DemoAuthorityConflict"],
    [
      "a duplicate payment mint",
      (p) => { p.allowedPaymentMints = [p.allowedPaymentMints[0], PublicKey.default, p.allowedPaymentMints[0], PublicKey.default]; },
      "DuplicatePaymentMint",
    ],
  ];

  for (const [description, mutate, error] of invalidSettings) {
    test(`rejects ${description} with ${error}`, async () => {
      const env = new TestEnv();
      const params = configParams(newRoles(env));
      mutate(params);

      expectError(
        env.send([await initializeConfigIx(env.upgradeAuthority.publicKey, params)], [env.upgradeAuthority]),
        error,
      );

      assert.equal(env.exists(configPda()), false);
    });
  }
});

describe("update_config", () => {
  test("the admin changes every setting up to the fee caps", async () => {
    const { env, roles, params } = await configuredEnv();
    const mints: [PublicKey, PublicKey, PublicKey, PublicKey] = [
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
    ];
    const settings = {
      kycAuthority: Keypair.generate().publicKey,
      demoKycAuthority: PublicKey.default,
      treasury: Keypair.generate().publicKey,
      raiseFeeBps: 500,
      revenueFeeBps: 2_000,
      minRaiseDuration: bn(7n * DAY),
      maxActivationWindow: bn(30n * DAY),
      allowedPaymentMints: mints,
      paused: true,
      recoveryDelay: bn(30n * DAY),
    };

    const result = expectOk(env.send([await updateConfigIx(roles.admin.publicKey, settings)], [roles.admin]));

    const expected = { ...params, ...settings };
    assert.deepEqual(plain(eventFields(env.fetch("config", configPda()))), plain(eventFields(expected)));
    assert.deepEqual(plain(expectEvent(result, "configUpdated")), plain(eventFields(expected)));
  });

  test("settings passed as null keep their stored values", async () => {
    const { env, roles } = await configuredEnv();
    const before = env.fetch("config", configPda());

    expectOk(env.send([await updateConfigIx(roles.admin.publicKey, { paused: true })], [roles.admin]));

    assert.deepEqual(plain(env.fetch("config", configPda())), plain({ ...before, paused: true }));
  });

  const outsiders: Array<[string, (env: TestEnv, roles: Roles) => Keypair]> = [
    ["an outsider", (env) => env.newAccount()],
    ["the upgrade authority", (env) => env.upgradeAuthority],
    ["the KYC authority", (_, roles) => roles.kyc],
  ];

  for (const [description, signerOf] of outsiders) {
    test(`${description} cannot update the config`, async () => {
      const { env, roles } = await configuredEnv();
      const signer = signerOf(env, roles);
      const before = plain(env.fetch("config", configPda()));

      expectError(
        env.send([await updateConfigIx(signer.publicKey, { paused: true, raiseFeeBps: 0 })], [signer]),
        "Unauthorized",
      );

      assert.deepEqual(plain(env.fetch("config", configPda())), before);
    });
  }

  const invalidChanges: Array<[string, (roles: Roles) => Partial<UpdateConfigParams>, ErrorName]> = [
    ["a raise fee above the cap", () => ({ raiseFeeBps: 501 }), "FeeTooHigh"],
    ["a revenue fee above the cap", () => ({ revenueFeeBps: 2_001 }), "FeeTooHigh"],
    ["a zero minimum raise duration", () => ({ minRaiseDuration: bn(0) }), "InvalidDuration"],
    ["a zero activation window", () => ({ maxActivationWindow: bn(0) }), "InvalidDuration"],
    ["a zero recovery delay", () => ({ recoveryDelay: bn(0) }), "InvalidRecoveryDelay"],
    ["a recovery delay given in milliseconds", () => ({ recoveryDelay: bn(3n * DAY * 1_000n) }), "InvalidRecoveryDelay"],
    ["the default KYC authority", () => ({ kycAuthority: PublicKey.default }), "InvalidAddress"],
    ["the default treasury", () => ({ treasury: PublicKey.default }), "InvalidAddress"],
    ["a demo key equal to the KYC key", (r) => ({ demoKycAuthority: r.kyc.publicKey }), "DemoAuthorityConflict"],
    ["a KYC key equal to the demo key", (r) => ({ kycAuthority: r.demoKyc.publicKey }), "DemoAuthorityConflict"],
    [
      "a duplicate payment mint",
      () => {
        const mint = Keypair.generate().publicKey;
        return { allowedPaymentMints: [PublicKey.default, mint, PublicKey.default, mint] };
      },
      "DuplicatePaymentMint",
    ],
  ];

  for (const [description, changesOf, error] of invalidChanges) {
    test(`rejects ${description} with ${error} and keeps the config unchanged`, async () => {
      const { env, roles } = await configuredEnv();
      const before = plain(env.fetch("config", configPda()));

      expectError(
        env.send([await updateConfigIx(roles.admin.publicKey, changesOf(roles))], [roles.admin]),
        error,
      );

      assert.deepEqual(plain(env.fetch("config", configPda())), before);
    });
  }
});

describe("admin handover", () => {
  test("the proposed admin accepts and takes over; the previous admin loses its rights", async () => {
    const { env, roles } = await configuredEnv();
    const successor = env.newAccount();

    const proposed = expectOk(
      env.send([await proposeAdminIx(roles.admin.publicKey, successor.publicKey)], [roles.admin]),
    );
    assert.deepEqual(
      plain(expectEvent(proposed, "adminProposed")),
      plain({ admin: roles.admin.publicKey, pendingAdmin: successor.publicKey }),
    );
    assert.deepEqual(plain(env.fetch("config", configPda()).pendingAdmin), plain(successor.publicKey));

    const accepted = expectOk(env.send([await acceptAdminIx(successor.publicKey)], [successor]));
    assert.deepEqual(
      plain(expectEvent(accepted, "adminChanged")),
      plain({ previousAdmin: roles.admin.publicKey, newAdmin: successor.publicKey }),
    );
    const config = env.fetch("config", configPda());
    assert.deepEqual(plain([config.admin, config.pendingAdmin]), plain([successor.publicKey, PublicKey.default]));

    expectError(
      env.send([await updateConfigIx(roles.admin.publicKey, { paused: true })], [roles.admin]),
      "Unauthorized",
    );
    expectOk(env.send([await updateConfigIx(successor.publicKey, { paused: true })], [successor]));
    assert.equal(env.fetch("config", configPda()).paused, true);
  });

  test("a pending admin has no admin rights before accepting", async () => {
    const { env, roles } = await configuredEnv();
    const successor = env.newAccount();
    expectOk(env.send([await proposeAdminIx(roles.admin.publicKey, successor.publicKey)], [roles.admin]));

    expectError(
      env.send([await updateConfigIx(successor.publicKey, { paused: true })], [successor]),
      "Unauthorized",
    );
  });

  test("only the admin can propose a successor", async () => {
    const { env } = await configuredEnv();
    const attacker = env.newAccount();

    expectError(
      env.send([await proposeAdminIx(attacker.publicKey, attacker.publicKey)], [attacker]),
      "Unauthorized",
    );

    assert.deepEqual(plain(env.fetch("config", configPda()).pendingAdmin), plain(PublicKey.default));
  });

  test("only the pending admin can accept", async () => {
    const { env, roles } = await configuredEnv();
    const successor = env.newAccount();
    const attacker = env.newAccount();
    expectOk(env.send([await proposeAdminIx(roles.admin.publicKey, successor.publicKey)], [roles.admin]));

    expectError(env.send([await acceptAdminIx(attacker.publicKey)], [attacker]), "Unauthorized");

    const config = env.fetch("config", configPda());
    assert.deepEqual(plain([config.admin, config.pendingAdmin]), plain([roles.admin.publicKey, successor.publicKey]));
  });

  test("accepting without a proposal fails with NoPendingAdmin", async () => {
    const { env, roles } = await configuredEnv();
    const attacker = env.newAccount();

    expectError(env.send([await acceptAdminIx(attacker.publicKey)], [attacker]), "NoPendingAdmin");

    assert.deepEqual(plain(env.fetch("config", configPda()).admin), plain(roles.admin.publicKey));
  });

  test("proposing the default key withdraws a pending proposal", async () => {
    const { env, roles } = await configuredEnv();
    const successor = env.newAccount();
    expectOk(env.send([await proposeAdminIx(roles.admin.publicKey, successor.publicKey)], [roles.admin]));

    expectOk(env.send([await proposeAdminIx(roles.admin.publicKey, PublicKey.default)], [roles.admin]));

    expectError(env.send([await acceptAdminIx(successor.publicKey)], [successor]), "NoPendingAdmin");
    assert.deepEqual(plain(env.fetch("config", configPda()).admin), plain(roles.admin.publicKey));
  });

  test("proposing the current admin is rejected", async () => {
    const { env, roles } = await configuredEnv();

    expectError(
      env.send([await proposeAdminIx(roles.admin.publicKey, roles.admin.publicKey)], [roles.admin]),
      "AdminUnchanged",
    );
  });
});
