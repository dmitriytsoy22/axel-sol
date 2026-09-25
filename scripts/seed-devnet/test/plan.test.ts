import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CITIES } from "../catalog";
import {
  buildPlan,
  DESK,
  planStats,
  SCALE_SPECS,
  SCALES,
  TARGET_STATES,
  type Plan,
  type Step,
} from "../plan";

const ANCHOR = "2026-09-25";

function plan(scale: (typeof SCALES)[number], seed = "axel-demo-2026"): Plan {
  return buildPlan({ seed, scale, anchorDate: ANCHOR });
}

function ofKind<K extends Step["kind"]>(p: Plan, kind: K): Array<Extract<Step, { kind: K }>> {
  return p.steps.filter((step): step is Extract<Step, { kind: K }> => step.kind === kind);
}

const serialize = (p: Plan) =>
  JSON.stringify(p.steps, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));

describe("seed plan", () => {
  test("is identical for the same seed, scale and anchor date", () => {
    assert.equal(serialize(plan("small")), serialize(plan("small")));
  });

  test("changes with the seed", () => {
    assert.notEqual(serialize(plan("small")), serialize(plan("small", "another-seed")));
  });

  test("full scale has the design spec's fleet: 24 cars, 60 investors, ~300 positions, ~120 periods, 40 transfers", () => {
    const stats = planStats(plan("full"));

    assert.deepEqual(stats.states, { operating: 16, paused: 1, closed: 1, funded: 2, fundraising: 3, failed: 1 });
    assert.equal(stats.investors, 60 + 2, "60 investors plus the desk and the recovery wallet");
    assert.ok(stats.positions >= 280 && stats.positions <= 320, `positions ${stats.positions}`);
    assert.ok(stats.periods >= 100 && stats.periods <= 130, `periods ${stats.periods}`);
    assert.equal(stats.byKind.transfer, 40);
  });

  for (const scale of SCALES) {
    describe(`at scale ${scale}`, () => {
      const p = plan(scale);

      test("reaches every project state the spec asks for", () => {
        for (const state of TARGET_STATES) {
          assert.equal(
            p.expected.filter((project) => project.state === state).length,
            SCALE_SPECS[scale].counts[state],
            state,
          );
        }
      });

      test("puts cars in Almaty, Astana and Shymkent", () => {
        assert.deepEqual(new Set(p.projects.map((project) => project.city)), new Set(Object.keys(CITIES)));
      });

      test("sells out every car past its raise, leaves open raises at their percentage and fails below the soft cap", () => {
        const percents = [...SCALE_SPECS[scale].fundraisingPercents];
        for (const project of p.projects) {
          const expected = p.expected[project.index];
          if (project.target === "fundraising") {
            assert.equal(expected.sold, (project.totalShares * BigInt(percents.shift()!)) / 100n, project.id);
          } else if (project.target === "failed") {
            assert.ok(expected.sold < project.softCapShares, project.id);
          } else {
            assert.equal(expected.sold, project.totalShares, project.id);
          }
        }
      });

      test("keeps shares conserved and never owes holders more than was deposited", () => {
        for (const [index, expected] of p.expected.entries()) {
          const positions = [...expected.positions.values()];
          const shares = positions.reduce((sum, position) => sum + position.shares, 0n);
          const owed = positions.reduce((sum, position) => sum + position.claimed + position.pending, 0n);
          assert.equal(shares, expected.sold - expected.refunded, p.projects[index].id);
          assert.ok(owed <= expected.depositedNet, `${p.projects[index].id}: ${owed} > ${expected.depositedNet}`);
        }
      });

      test("records each car's telemetry in strictly increasing batches of at most 20 days", () => {
        const last = new Map<number, number>();
        for (const step of ofKind(p, "telemetry")) {
          assert.ok(step.dates.length >= 1 && step.dates.length <= 20);
          for (const date of step.dates) {
            assert.ok(date > (last.get(step.project) ?? 0), `${step.id} ${date}`);
            last.set(step.project, date);
          }
        }
      });

      test("deposits a month only after all of its telemetry is recorded", () => {
        for (const deposit of ofKind(p, "deposit")) {
          const index = p.steps.indexOf(deposit);
          const month = Number(deposit.report.slice(0, 7).replace("-", ""));
          const later = p.steps
            .slice(index + 1)
            .filter(
              (step) =>
                step.kind === "telemetry" &&
                step.project === deposit.project &&
                Math.floor(step.dates[0] / 100) <= month,
            );
          assert.deepEqual(later, [], deposit.id);
        }
      });

      test("closes the sold car right after its final deposit and moves no shares of it afterwards", () => {
        for (const close of ofKind(p, "close")) {
          const index = p.steps.indexOf(close);
          const previous = p.steps[index - 1];
          assert.equal(previous.kind, "deposit");
          assert.equal((previous as { final: boolean }).final, true);
          const after = p.steps
            .slice(index + 1)
            .filter((step) => step.kind === "transfer" && step.project === close.project);
          assert.deepEqual(after, []);
        }
      });

      test("lets the lost-key wallet and the desk do nothing after the recovery is proposed", () => {
        const propose = p.steps.findIndex((step) => step.kind === "propose-recovery");
        const acting = p.steps.slice(propose + 1).filter(
          (step) =>
            (step.kind === "transfer" && [p.recovery.from, DESK].includes(step.from)) ||
            (step.kind === "transfer" && [p.recovery.from, DESK].includes(step.to)) ||
            (step.kind === "claim" && [p.recovery.from, DESK].includes(step.investor)),
        );
        assert.deepEqual(acting, []);
      });

      test("claims only revenue that exists", () => {
        for (const claim of ofKind(p, "claim")) {
          assert.ok(claim.amount > 0n, claim.id);
        }
      });

      test("finalizes the failed raise after all its purchases and refunds half of its buyers", () => {
        const failed = p.projects.find((project) => project.target === "failed")!;
        const finalize = p.steps.findIndex((step) => step.kind === "finalize");
        const buys = ofKind(p, "buy").filter((step) => step.project === failed.index);
        const refunds = ofKind(p, "refund");
        assert.ok(buys.every((buy) => p.steps.indexOf(buy) < finalize));
        assert.ok(refunds.every((refund) => p.steps.indexOf(refund) > finalize));
        assert.equal(refunds.length, Math.ceil(buys.length / 2));
      });

      test("gives the desk a fifth of each desk car as demo inventory", () => {
        for (const project of p.projects.filter((car) => car.desk)) {
          assert.equal(p.expected[project.index].positions.get(DESK)!.paidIn, (project.totalShares / 5n) * project.pricePerShareBase);
        }
      });
    });
  }
});
