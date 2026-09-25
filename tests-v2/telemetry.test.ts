import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import { PACKET_DATA_SIZE, type Keypair } from "@solana/web3.js";
import { eventsOf, expectError, expectOk } from "./helpers/assert";
import { bn, type TxResult } from "./helpers/env";
import {
  buy,
  closeProject,
  marketEnv,
  newInvestor,
  openProject,
  operatingProject,
  pauseProject,
  type Market,
} from "./helpers/fixtures";
import { cancelRaiseIx, recordTelemetryIx, type ProjectRef, type TelemetryEntry } from "./helpers/instructions";
import { plain } from "./helpers/plain";

const EMPTY_HEAD = Array<number>(32).fill(0);
const TELEMETRY_CU_LIMIT = 200_000n;
const MS_PER_DAY = 86_400_000;

/** YYYYMMDD of the day `offset` days after October 1st, 2026. */
function day(offset: number): number {
  const date = new Date(Date.UTC(2026, 9, 1) + offset * MS_PER_DAY);
  return date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

/** The entry that commits to the report the fleet publishes for that day. */
function report(date: number): TelemetryEntry {
  const summary = { date, trips: 15 + (date % 9), km: 180 + (date % 70), rentPaid: 11_000 + (date % 4) * 500, status: date % 11 === 0 ? 2 : 0 };
  const published = JSON.stringify({ car: "Kia Rio #017", park: "Demo Park Almaty-1", ...summary });
  return { ...summary, dataHash: [...createHash("sha256").update(published).digest()] };
}

function reports(firstOffset: number, count: number): TelemetryEntry[] {
  return Array.from({ length: count }, (_, i) => report(day(firstOffset + i)));
}

/**
 * Recomputes the chain from published records the way any verifier would:
 * `head = sha256(head || date as u32 LE || data_hash)`. Returns the head after each record.
 */
function chain(start: number[], entries: TelemetryEntry[]): number[][] {
  const heads: number[][] = [];
  let head = Buffer.from(start);
  for (const entry of entries) {
    const date = Buffer.alloc(4);
    date.writeUInt32LE(entry.date);
    head = createHash("sha256").update(Buffer.concat([head, date, Buffer.from(entry.dataHash)])).digest();
    heads.push([...head]);
  }
  return heads;
}

async function record(market: Market, project: ProjectRef, entries: TelemetryEntry[], oracle: Keypair = market.oracle): Promise<TxResult> {
  return market.env.send([await recordTelemetryIx(project, oracle.publicKey, entries)], [oracle]);
}

function chainState(market: Market, project: ProjectRef) {
  const stored = market.env.fetch("project", project.address);
  return { head: stored.telemetryHead, count: stored.telemetryCount, lastDate: stored.lastTelemetryDate };
}

describe("record_telemetry", () => {
  test("the oracle's batch moves the on-chain head to the chain recomputed from the published reports", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const entries = reports(0, 7);

    const result = expectOk(await record(market, project, entries));

    const heads = chain(EMPTY_HEAD, entries);
    assert.deepEqual(chainState(market, project), { head: heads[6], count: 7, lastDate: day(6) });
    assert.deepEqual(
      plain(eventsOf(result, "telemetryRecorded")),
      plain(entries.map((entry, i) => ({ project: project.address, ...entry, head: heads[i], count: i + 1 }))),
    );
  });

  test("a later batch extends the same chain", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const [first, second] = [reports(0, 5), reports(5, 5)];
    expectOk(await record(market, project, first));

    expectOk(await record(market, project, second));

    assert.deepEqual(chainState(market, project), {
      head: chain(EMPTY_HEAD, [...first, ...second])[9],
      count: 10,
      lastDate: day(9),
    });
  });

  test("days the car was off the line may be skipped", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const entries = [0, 3, 10, 31].map((offset) => report(day(offset)));

    expectOk(await record(market, project, entries));

    assert.deepEqual(chainState(market, project), { head: chain(EMPTY_HEAD, entries)[3], count: 4, lastDate: day(31) });
  });

  test("20 days fit in one transaction that only the oracle signs", async (t) => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const entries = reports(0, 20);
    const tx = market.env.transaction([await recordTelemetryIx(project, market.oracle.publicKey, entries)], [market.oracle]);

    const size = tx.serialize().length;
    const result = expectOk(market.env.svm.sendTransaction(tx));

    assert.ok(size <= PACKET_DATA_SIZE, `transaction is ${size} bytes`);
    assert.equal(chainState(market, project).count, 20);
    t.diagnostic(`record_telemetry x20: ${size} bytes, ${result.computeUnitsConsumed()} CU`);
    assert.ok(result.computeUnitsConsumed() < TELEMETRY_CU_LIMIT, `CU ${result.computeUnitsConsumed()}`);
  });

  test("a batch of 21 days is rejected even though it fits in a transaction (TooManyTelemetryEntries)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const tx = market.env.transaction([await recordTelemetryIx(project, market.oracle.publicKey, reports(0, 21))], [market.oracle]);

    const size = tx.serialize().length;
    const result = market.env.svm.sendTransaction(tx);

    assert.ok(size <= PACKET_DATA_SIZE, `transaction is ${size} bytes`);
    expectError(result, "TooManyTelemetryEntries");
    assert.deepEqual(chainState(market, project), { head: EMPTY_HEAD, count: 0, lastDate: 0 });
  });

  test("an empty batch is rejected (EmptyTelemetryBatch)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);

    expectError(await record(market, project, []), "EmptyTelemetryBatch");
  });

  const rewrites: Array<{ name: string; earlier: TelemetryEntry[]; batch: TelemetryEntry[] }> = [
    { name: "a day repeated within the batch", earlier: reports(0, 1), batch: [report(day(1)), report(day(2)), report(day(2))] },
    {
      name: "a day earlier than the one before it in the batch",
      earlier: reports(0, 1),
      batch: [report(day(1)), report(day(3)), report(day(2))],
    },
    { name: "a day an earlier batch already recorded", earlier: reports(0, 3), batch: [report(day(2))] },
    { name: "a day before the last one recorded", earlier: reports(0, 5), batch: [report(day(3)), report(day(5))] },
    {
      name: "a different report for a recorded day",
      earlier: reports(0, 3),
      batch: [{ ...report(day(2)), dataHash: Array<number>(32).fill(7) }],
    },
  ];
  for (const { name, earlier, batch } of rewrites) {
    test(`history cannot be rewritten: ${name} is rejected (TelemetryDateNotIncreasing)`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);
      expectOk(await record(market, project, earlier));
      const before = chainState(market, project);

      expectError(await record(market, project, batch), "TelemetryDateNotIncreasing");

      assert.deepEqual(chainState(market, project), before);
    });
  }

  const invalidDates: Array<[string, number]> = [
    ["a month that does not exist", 20261301],
    ["February 30th", 20260230],
    ["zero", 0],
    ["a day before 2000", 19991231],
  ];
  for (const [name, date] of invalidDates) {
    test(`a record dated ${name} is rejected (InvalidTelemetryDate)`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);

      expectError(await record(market, project, [report(day(0)), { ...report(day(1)), date }]), "InvalidTelemetryDate");

      assert.deepEqual(chainState(market, project), { head: EMPTY_HEAD, count: 0, lastDate: 0 });
    });
  }

  const impostors: Array<{ name: string; signer: (market: Market) => Keypair }> = [
    { name: "the operator", signer: (market) => market.operator },
    { name: "the admin", signer: (market) => market.roles.admin },
    { name: "a stranger", signer: (market) => market.env.newAccount() },
  ];
  for (const { name, signer } of impostors) {
    test(`${name} cannot record telemetry (Unauthorized)`, async () => {
      const market = await marketEnv();
      const { project } = await operatingProject(market);

      expectError(await record(market, project, reports(0, 2), signer(market)), "Unauthorized");

      assert.deepEqual(chainState(market, project), { head: EMPTY_HEAD, count: 0, lastDate: 0 });
    });
  }

  test("a batch the oracle did not sign is rejected (AccountNotSigner)", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    const ix = await recordTelemetryIx(project, market.oracle.publicKey, reports(0, 2));
    ix.keys[0].isSigner = false;

    expectError(market.env.send([ix], [market.operator]), "AccountNotSigner");
  });

  test("a paused car keeps reporting", async () => {
    const market = await marketEnv();
    const { project } = await operatingProject(market);
    expectOk(await pauseProject(market, project));

    expectOk(await record(market, project, reports(0, 3)));

    assert.equal(chainState(market, project).count, 3);
  });

  const noCar: Array<{ name: string; setup: (market: Market) => Promise<ProjectRef> }> = [
    { name: "during the raise", setup: (market) => openProject(market) },
    {
      name: "while funded and awaiting activation",
      setup: async (market) => {
        const project = await openProject(market, { totalShares: bn(10), softCapShares: bn(10) });
        expectOk(await buy(market, project, await newInvestor(market), 10n));
        return project;
      },
    },
    {
      name: "after the raise failed",
      setup: async (market) => {
        const project = await openProject(market);
        const { admin } = market.roles;
        expectOk(market.env.send([await cancelRaiseIx(project, admin.publicKey)], [admin]));
        return project;
      },
    },
    {
      name: "after the project closed",
      setup: async (market) => {
        const { project } = await operatingProject(market);
        expectOk(await closeProject(market, project));
        return project;
      },
    },
  ];
  for (const { name, setup } of noCar) {
    test(`telemetry cannot be recorded ${name} (InvalidState)`, async () => {
      const market = await marketEnv();
      const project = await setup(market);

      expectError(await record(market, project, reports(0, 2)), "InvalidState");
    });
  }
});
