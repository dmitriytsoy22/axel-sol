import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CAR_MODELS } from "../catalog";
import {
  ASSUMPTIONS,
  assumptionList,
  carEconomics,
  salePriceKzt,
  simulateMonth,
  STATUS_CODE,
  type CarEconomics,
  type MonthReport,
} from "../economics";
import { daysInMonth } from "../lib/dates";
import { Rng } from "../lib/random";

const SAMPLES = 200;
const cobalt = CAR_MODELS.find((model) => model.slug === "chevrolet-cobalt")!;

function car(sample: number): CarEconomics {
  return carEconomics(Rng.stream("economics-test", "car", sample), cobalt.carClass, cobalt.priceKzt);
}

function month(sample: number, m: number, accidentDay?: number): MonthReport {
  return simulateMonth({
    rng: Rng.stream("economics-test", "month", sample, m),
    month: { year: 2026, month: m },
    car: car(sample),
    parkFeeBps: 1_750,
    accidentDay,
    carriedLossKzt: 0,
  });
}

const count = (report: MonthReport, status: string) => report.days.filter((day) => day.status === status).length;

describe("economics generator", () => {
  test("labels every assumption and publishes all of them", () => {
    const list = assumptionList();
    assert.deepEqual(list.map((a) => a.key), Object.keys(ASSUMPTIONS));
    for (const assumption of list) {
      assert.match(assumption.note, /^(Assumption|Demo)/, assumption.key);
    }
  });

  test("prices cars within the model's range in whole shares of 10 000 tenge", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const economics = car(i);
      assert.ok(economics.priceKzt >= cobalt.priceKzt[0] && economics.priceKzt <= cobalt.priceKzt[1]);
      assert.equal(economics.shares * 10_000, economics.priceKzt);
      assert.ok(economics.dailyRentKzt >= 9_000 && economics.dailyRentKzt <= 13_000);
    }
  });

  test("rents a car out 22–27 days in a regular month, at its daily rent", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const report = month(i, 5);
      const active = count(report, "active");
      assert.ok(active >= 22 && active <= 27, `active ${active}`);
      assert.equal(report.rentCollectedKzt, active * car(i).dailyRentKzt);
      assert.equal(report.days.length, daysInMonth({ year: 2026, month: 5 }));
    }
  });

  test("rents it out 2–4 days less in winter", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const active = count(month(i, 1), "active");
      assert.ok(active >= 18 && active <= 25, `active ${active}`);
    }
  });

  test("takes the car off the road for 5–9 days after an accident and charges the deductible", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const report = month(i, 5, 10);
      const repair = count(report, "repair");
      assert.ok(repair >= 5 && repair <= 9, `repair ${repair}`);
      assert.equal(report.days[9].status, "repair");
      assert.ok(report.repairsKzt >= 50_000 && report.repairsKzt <= 100_000);
    }
  });

  test("balances the monthly P&L to the tenge", () => {
    for (let i = 0; i < SAMPLES; i++) {
      const r = month(i, 5, i % 2 === 0 ? 12 : undefined);
      assert.equal(
        r.distributableKzt - r.lossCarriedForwardKzt,
        r.rentCollectedKzt - r.parkFeeKzt - r.maintenanceKzt - r.insuranceKzt - r.repairsKzt - r.carriedLossKzt,
      );
    }
  });

  test("depreciates linearly from the purchase price to the residual value", () => {
    const economics: CarEconomics = {
      priceKzt: 10_000_000,
      shares: 1_000,
      dailyRentKzt: 11_000,
      insuranceKztPerYear: 300_000,
      depreciationYears: 5,
      residualValueBps: 4_000,
    };
    assert.equal(salePriceKzt(economics, 0), 10_000_000);
    assert.equal(salePriceKzt(economics, 30), 7_000_000);
    assert.equal(salePriceKzt(economics, 60), 4_000_000);
    assert.equal(salePriceKzt(economics, 90), 4_000_000);
  });

  test("writes the on-chain status codes the backend oracle writes, and never 0", () => {
    // backend/src/telemetry/day-record.ts: active 1, idle 2, maintenance 3; docs/api.md adds repair 4.
    assert.deepEqual(STATUS_CODE, { active: 1, idle: 2, maintenance: 3, repair: 4 });
  });
});
