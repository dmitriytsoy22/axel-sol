import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { expectError, expectEvent, expectOk, type ErrorName } from "./helpers/assert";
import { big, bn, type TxResult } from "./helpers/env";
import {
  claim,
  closeProject,
  DAY,
  deposit,
  depositNet,
  marketEnv,
  operatingProject,
  pauseProject,
  revenueParams,
  transfer,
  type Market,
} from "./helpers/fixtures";
import {
  closePositionIx,
  closeProjectIx,
  depositRevenueIx,
  pauseProjectIx,
  ProjectState,
  recordTelemetryIx,
  resumeProjectIx,
  RevenueKind,
  setProjectRolesIx,
  type ProjectRef,
} from "./helpers/instructions";
import { assertInvariants } from "./helpers/invariants";
import { LIFECYCLE_STATES, projectIn } from "./helpers/lifecycle";
import { positionPda } from "./helpers/pda";
import { plain } from "./helpers/plain";
import { ata, mintTo, readMint, tokenBalance } from "./helpers/tokens";

type AdminAction = (project: ProjectRef, admin: PublicKey) => Promise<TransactionInstruction>;

const TELEMETRY_DAY = {
  date: 20261001,
  dataHash: Array<number>(32).fill(9),
  trips: 21,
  km: 240,
  rentPaid: 12_500,
  status: 0,
};

function stateOf(market: Market, project: ProjectRef) {
  return plain(market.env.fetch("project", project.address).state);
}

async function asAdmin(market: Market, project: ProjectRef, action: AdminAction, signer: Keypair = market.roles.admin): Promise<TxResult> {
  return market.env.send([await action(project, signer.publicKey)], [signer]);
}

/** A deposit by `operator` co-signed by `oracle` into the project's next period. */
async function depositAs(market: Market, project: ProjectRef, operator: Keypair, oracle: Keypair): Promise<TxResult> {
  const ix = await depositRevenueIx(
    project,
    {
      operator: operator.publicKey,
      oracle: oracle.publicKey,
      treasury: market.roles.treasury.publicKey,
      periodIndex: market.env.fetch("project", project.address).periodCount,
    },
    revenueParams(1_000_000n),
  );
  return market.env.send([ix], [operator, oracle]);
}

async function recordAs(market: Market, project: ProjectRef, oracle: Keypair, date: number): Promise<TxResult> {
  return market.env.send([await recordTelemetryIx(project, oracle.publicKey, [{ ...TELEMETRY_DAY, date }])], [oracle]);
}

/** Every lifecycle state a project can be in, reached through instructions only. */
const LIFECYCLE: Record<string, (market: Market) => Promise<ProjectRef>> = Object.fromEntries(
  LIFECYCLE_STATES.map((state) => [state, async (market: Market) => (await projectIn(market, state)).project]),
);

const setOperator: AdminAction = (project, admin) => setProjectRolesIx(project, admin, { operator: Keypair.generate().publicKey });

const TRANSITIONS: Array<{ name: string; action: AdminAction; allowedFrom: string[]; to: string }> = [
  { name: "pause", action: pauseProjectIx, allowedFrom: ["operating"], to: "paused" },
  { name: "resume", action: resumeProjectIx, allowedFrom: ["paused"], to: "operating" },
  { name: "close", action: closeProjectIx, allowedFrom: ["operating", "paused"], to: "closed" },
];

describe("pause and resume", () => {
  test("the admin pauses an operating project and resumes it, and shares move again", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;

    const paused = expectOk(await asAdmin(market, project, pauseProjectIx));
    const stateWhilePaused = stateOf(market, project);
    const resumed = expectOk(await asAdmin(market, project, resumeProjectIx));

    assert.deepEqual(stateWhilePaused, plain(ProjectState.paused));
    assert.deepEqual(plain(expectEvent(paused, "projectPaused")), plain({ project: project.address }));
    assert.deepEqual(stateOf(market, project), plain(ProjectState.operating));
    assert.deepEqual(plain(expectEvent(resumed, "projectResumed")), plain({ project: project.address }));
    expectOk(transfer(market, project, alice, bob.publicKey, 5n));
  });

  test("a paused project takes no deposits or transfers, but pays claims and records telemetry", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const [alice, bob] = holders;
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(await pauseProject(market, project));

    expectError(await deposit(market, project, 1_000n), "InvalidState");
    expectError(transfer(market, project, alice, bob.publicKey, 5n), "InvalidState");
    expectOk(await claim(market, project, alice));
    expectOk(await recordAs(market, project, market.oracle, 20261001));

    assert.equal(big(market.env.fetch("position", positionPda(project.address, alice.publicKey)).totalClaimed), 500n);
    assertInvariants(market.env, project, holders.map((holder) => holder.publicKey));
  });
});

describe("admin state transitions", () => {
  for (const { name, action, allowedFrom, to } of TRANSITIONS) {
    for (const from of Object.keys(LIFECYCLE).filter((state) => !allowedFrom.includes(state))) {
      test(`${name} is rejected for a project that is ${from} (InvalidState)`, async () => {
        const market = await marketEnv();
        const project = await LIFECYCLE[from](market);

        expectError(await asAdmin(market, project, action), "InvalidState");

        assert.deepEqual(stateOf(market, project), plain(ProjectState[from as keyof typeof ProjectState]));
      });
    }
    for (const from of allowedFrom) {
      test(`${name} moves the project from ${from} to ${to}`, async () => {
        const market = await marketEnv();
        const project = await LIFECYCLE[from](market);

        expectOk(await asAdmin(market, project, action));

        assert.deepEqual(stateOf(market, project), plain(ProjectState[to as keyof typeof ProjectState]));
      });
    }
  }

  const adminOnly: Array<{ name: string; action: AdminAction; from: string }> = [
    { name: "pause", action: pauseProjectIx, from: "operating" },
    { name: "resume", action: resumeProjectIx, from: "paused" },
    { name: "close", action: closeProjectIx, from: "operating" },
    { name: "change the roles of", action: setOperator, from: "operating" },
  ];
  for (const { name, action, from } of adminOnly) {
    test(`the operator cannot ${name} a project (Unauthorized)`, async () => {
      const market = await marketEnv();
      const project = await LIFECYCLE[from](market);
      const before = plain(market.env.fetch("project", project.address));

      expectError(await asAdmin(market, project, action, market.operator), "Unauthorized");

      assert.deepEqual(plain(market.env.fetch("project", project.address)), before);
    });
  }
});

describe("set_project_roles", () => {
  test("a new operator takes over deposits and the old one is locked out", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const successor = market.env.newAccount();
    mintTo(market.env, market.paymentMint, market.paymentProgram, market.issuer, successor.publicKey, 10n ** 12n);

    const result = expectOk(
      await asAdmin(market, project, (p, admin) => setProjectRolesIx(p, admin, { operator: successor.publicKey })),
    );

    assert.deepEqual(
      plain(expectEvent(result, "rolesUpdated")),
      plain({ project: project.address, operator: successor.publicKey, oracle: market.oracle.publicKey }),
    );
    expectError(await depositAs(market, project, market.operator, market.oracle), "Unauthorized");
    expectOk(await depositAs(market, project, successor, market.oracle));
  });

  test("a new oracle takes over attestation and telemetry and the old one is locked out", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const successor = market.env.newAccount();

    expectOk(await asAdmin(market, project, (p, admin) => setProjectRolesIx(p, admin, { oracle: successor.publicKey })));

    const stored = market.env.fetch("project", project.address);
    assert.deepEqual(plain([stored.operator, stored.oracle]), plain([market.operator.publicKey, successor.publicKey]));
    expectError(await depositAs(market, project, market.operator, market.oracle), "InvalidAttestor");
    expectError(await recordAs(market, project, market.oracle, 20261001), "Unauthorized");
    expectOk(await depositAs(market, project, market.operator, successor));
    expectOk(await recordAs(market, project, successor, 20261001));
  });

  test("roles can be changed while the project is paused", async () => {
    const market = await marketEnv();
    const project = await LIFECYCLE.paused(market);

    expectOk(await asAdmin(market, project, setOperator));
  });

  const conflicts: Array<{
    name: string;
    error: ErrorName;
    roles: (market: Market) => { operator?: PublicKey; oracle?: PublicKey };
  }> = [
    { name: "the oracle as operator", error: "RoleConflict", roles: (market) => ({ operator: market.oracle.publicKey }) },
    { name: "the operator as oracle", error: "RoleConflict", roles: (market) => ({ oracle: market.operator.publicKey }) },
    {
      name: "one new key for both roles",
      error: "RoleConflict",
      roles: () => {
        const key = Keypair.generate().publicKey;
        return { operator: key, oracle: key };
      },
    },
    { name: "the default key as operator", error: "InvalidAddress", roles: () => ({ operator: PublicKey.default }) },
    { name: "the default key as oracle", error: "InvalidAddress", roles: () => ({ oracle: PublicKey.default }) },
  ];
  for (const { name, error, roles } of conflicts) {
    test(`${name} is rejected (${error})`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);

      expectError(await asAdmin(market, project, (p, admin) => setProjectRolesIx(p, admin, roles(market))), error);

      const stored = market.env.fetch("project", project.address);
      assert.deepEqual(plain([stored.operator, stored.oracle]), plain([market.operator.publicKey, market.oracle.publicKey]));
    });
  }

  const fixedRoles: Array<[string, string]> = [
    ["fundraising", "the operator is fixed before activation, so the raise cannot be redirected"],
    ["funded", "the operator is fixed before activation, so the raise cannot be redirected"],
    ["failed", "roles cannot change once the raise failed"],
    ["closed", "roles cannot change once the project closed"],
  ];
  for (const [from, name] of fixedRoles) {
    test(`${name} (${from}, InvalidState)`, async () => {
      const market = await marketEnv();
      const project = await LIFECYCLE[from](market);

      expectError(await asAdmin(market, project, setOperator), "InvalidState");

      assert.deepEqual(
        plain(market.env.fetch("project", project.address).operator),
        plain(market.operator.publicKey),
      );
    });
  }
});

describe("close_project", () => {
  test("closing moves no funds, and every holder can still claim its revenue long after (R3a)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    const carol = holders[2];
    expectOk(await deposit(market, project, 2_000n));
    const firstAcc = big(market.env.fetch("project", project.address).accPerShare);
    const carolFirst = big(expectEvent(expectOk(await claim(market, project, carol)), "claimed").amount);
    expectOk(await depositNet(market, project, 1_000_000n));
    const unclaimed = big(market.env.fetch("project", project.address).totalDepositedNet) - carolFirst;
    const watched = [
      project.revenue,
      ata(market.operator.publicKey, market.paymentMint, market.paymentProgram),
      ata(market.roles.treasury.publicKey, market.paymentMint, market.paymentProgram),
    ];
    const before = watched.map((account) => tokenBalance(market.env, account));

    const result = expectOk(await closeProject(market, project));

    assert.deepEqual(
      watched.map((account) => tokenBalance(market.env, account)),
      before,
      "vault, operator and treasury balances are unchanged",
    );
    assert.equal(market.env.exists(ata(market.roles.admin.publicKey, market.paymentMint, market.paymentProgram)), false);
    const stored = market.env.fetch("project", project.address);
    assert.deepEqual(plain([stored.state, stored.closedAt]), plain([ProjectState.closed, bn(market.env.now())]));
    assert.deepEqual(plain(expectEvent(result, "projectClosed")), plain({ project: project.address, unclaimed: bn(unclaimed) }));

    market.env.warp(400n * DAY);
    const paid = [];
    for (const holder of holders) {
      paid.push(expectEvent(expectOk(await claim(market, project, holder)), "claimed").amount);
    }
    const acc = big(stored.accPerShare);
    assert.deepEqual(
      plain(paid),
      plain([(50n * acc) >> 64n, (30n * acc) >> 64n, (20n * (acc - firstAcc)) >> 64n].map(bn)),
    );
    assert.equal(tokenBalance(market.env, project.revenue), unclaimed - paid.reduce((sum, amount) => sum + big(amount), 0n));
    assertInvariants(market.env, project, holders.map((holder) => holder.publicKey));
  });

  test("after closing, holders burn their shares and close their positions until no supply is left", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(await closeProject(market, project));

    for (const holder of holders) {
      expectOk(await claim(market, project, holder));
      expectOk(market.env.send([await closePositionIx(project, holder.publicKey)], [holder]));
    }

    assert.equal(readMint(market.env, project.shareMint).supply, 0n);
    const stored = market.env.fetch("project", project.address);
    assert.deepEqual(plain([stored.sharesRetired, stored.totalClaimed]), plain([bn(100), bn(1_000)]));
    assert.equal(tokenBalance(market.env, project.revenue), 0n);
  });

  test("a holder must claim before burning its shares (PositionNotEmpty)", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market);
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(await closeProject(market, project));

    expectError(market.env.send([await closePositionIx(project, holders[0].publicKey)], [holders[0]]), "PositionNotEmpty");

    assert.equal(readMint(market.env, project.shareMint).supply, 100n);
  });

  test("the car's sale is paid out as a final deposit through the same accumulator before closing", async () => {
    const market = await marketEnv();
    const { project, holders } = await operatingProject(market, [60n, 40n]);
    const [alice, bob] = holders;
    expectOk(await depositNet(market, project, 1_000n));
    expectOk(await deposit(market, project, 7_000_000_000n, { periodStart: 20270315, periodEnd: 20270315, kind: RevenueKind.final }));
    expectOk(await closeProject(market, project));

    const claimed = [];
    for (const holder of [alice, bob]) {
      claimed.push(big(expectEvent(expectOk(await claim(market, project, holder)), "claimed").amount));
    }

    const saleNet = 7_000_000_000n - (7_000_000_000n * 1_500n) / 10_000n;
    assert.deepEqual(claimed, [600n + (saleNet * 60n) / 100n, 400n + (saleNet * 40n) / 100n]);
  });
});
