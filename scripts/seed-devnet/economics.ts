/**
 * Economics of the demo fleet: daily telemetry and monthly P&L of every car.
 *
 * EVERY NUMBER IN `ASSUMPTIONS` IS AN ASSUMPTION, NOT MARKET DATA. They are placeholders
 * from the design spec, to be checked against 2–3 kolesa.kz / olx.kz listings of cars rented
 * out for taxi work and 1–2 park interviews before the pitch. The seed copies this list
 * into its output and into every published report, so the demo never presents them as facts.
 *
 * The money model: a park rents the car to a driver for a daily fee. The owner's income is
 * that rent minus the park's commission, maintenance, insurance and repairs. The operator
 * deposits this income on-chain each month; the program takes the platform fee and the rest
 * goes to the shareholders. When the car is sold, the proceeds are deposited the same way.
 * The return is the cash yield plus what the car sells for, not yield farming.
 */
import type { CarClass } from "./catalog";
import { daysInMonth, yyyymmdd, type Month } from "./lib/dates";
import type { Json } from "./lib/jcs";
import type { Rng } from "./lib/random";

type Range = readonly [number, number];

export type Assumption = {
  value: Json;
  unit: string;
  note: string;
};

export const ASSUMPTIONS = {
  sharePriceKzt: {
    value: 10_000,
    unit: "KZT per share",
    note: "Assumption. Shares per car = car price / share price; car prices are rounded to it.",
  },
  carPriceKzt: {
    value: "per model, see catalog.ts",
    unit: "KZT, new car, 2026",
    note: "Assumption. Placeholder ranges per model; check dealer and kolesa.kz prices.",
  },
  dailyRentKzt: {
    value: { economy: [9_000, 13_000], comfort: [14_000, 20_000], "comfort+": [20_000, 26_000] },
    unit: "KZT per rented day",
    note: "Assumption. Rent a park charges a driver. Economy and comfort come from the design spec; comfort+ is extrapolated.",
  },
  workingDaysPerMonth: {
    value: [22, 27],
    unit: "rented days per month",
    note: "Assumption. Days a driver rents the car.",
  },
  winterDropDays: {
    value: [2, 4],
    unit: "fewer rented days in December, January and February",
    note: "Assumption. Seasonal dip.",
  },
  scheduledMaintenanceDays: {
    value: [1, 2],
    unit: "days per month",
    note: "Assumption. Days off the road for scheduled service.",
  },
  maintenanceCostBps: {
    value: [600, 1_000],
    unit: "basis points of rent collected",
    note: "Assumption. Service, tyres and consumables (6–10%).",
  },
  insuranceKztPerYear: {
    value: [250_000, 450_000],
    unit: "KZT per year",
    note: "Assumption. Compulsory OGPO plus KASKO, charged monthly.",
  },
  parkFeeBps: {
    value: [1_500, 2_000],
    unit: "basis points of rent collected",
    note: "Assumption. Park commission for drivers, dispatch and parking (15–20%).",
  },
  depreciationYears: {
    value: [4, 5],
    unit: "years",
    note: "Assumption. Time until the car is sold.",
  },
  residualValueBps: {
    value: [3_500, 5_000],
    unit: "basis points of the purchase price at the end of the depreciation period",
    note: "Assumption. Resale value (35–50%); depreciation is linear in between.",
  },
  accidentDowntimeDays: {
    value: [5, 9],
    unit: "days in repair after an accident",
    note: "Assumption.",
  },
  accidentDeductibleKzt: {
    value: [50_000, 100_000],
    unit: "KZT per accident",
    note: "Assumption. KASKO deductible paid by the owner; the insurer pays the rest of the repair.",
  },
  tripsPerRentedDay: {
    value: { mean: 18, sd: 5, min: 4, max: 34 },
    unit: "trips",
    note: "Assumption. Only a telemetry summary; revenue does not depend on it.",
  },
  kmPerTrip: {
    value: [6, 12],
    unit: "km",
    note: "Assumption.",
  },
  softCapBps: {
    value: 6_000,
    unit: "basis points of the shares",
    note: "Demo choice. Minimum share of the car that must sell for a raise to succeed.",
  },
  platformRaiseFeeBps: {
    value: 200,
    unit: "basis points of a successful raise",
    note: "Demo configuration, not a pricing decision. Program cap is 500.",
  },
  platformRevenueFeeBps: {
    value: 500,
    unit: "basis points of every revenue deposit",
    note: "Demo configuration, not a pricing decision. Program cap is 2 000.",
  },
} as const satisfies Record<string, Assumption>;

export type AssumptionKey = keyof typeof ASSUMPTIONS;

/** The assumptions as published next to the demo data. */
export function assumptionList(): Array<{ key: AssumptionKey } & Assumption> {
  return (Object.keys(ASSUMPTIONS) as AssumptionKey[]).map((key) => ({ key, ...ASSUMPTIONS[key] }));
}

const RENT: Record<CarClass, Range> = ASSUMPTIONS.dailyRentKzt.value;
const WINTER_MONTHS = new Set([12, 1, 2]);

/** Vehicle status of a day in the telemetry. The on-chain `status` byte is the code. */
export const DAY_STATUSES = ["active", "idle", "maintenance", "repair"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

/** Published status codes: 0 rented out, 1 no driver, 2 scheduled service, 3 accident repair. */
export const STATUS_CODE: Record<DayStatus, number> = { active: 0, idle: 1, maintenance: 2, repair: 3 };

/** Constants of one car, drawn once. */
export interface CarEconomics {
  priceKzt: number;
  shares: number;
  dailyRentKzt: number;
  insuranceKztPerYear: number;
  depreciationYears: number;
  residualValueBps: number;
}

function between(rng: Rng, [min, max]: Range, step = 1): number {
  return rng.int(Math.ceil(min / step), Math.floor(max / step)) * step;
}

export function carEconomics(rng: Rng, carClass: CarClass, priceRangeKzt: Range): CarEconomics {
  const sharePrice = ASSUMPTIONS.sharePriceKzt.value;
  const priceKzt = between(rng, priceRangeKzt, sharePrice);
  return {
    priceKzt,
    shares: priceKzt / sharePrice,
    dailyRentKzt: between(rng, RENT[carClass], 500),
    insuranceKztPerYear: between(rng, ASSUMPTIONS.insuranceKztPerYear.value, 10_000),
    depreciationYears: between(rng, ASSUMPTIONS.depreciationYears.value),
    residualValueBps: between(rng, ASSUMPTIONS.residualValueBps.value, 100),
  };
}

export function parkFeeBps(rng: Rng): number {
  return between(rng, ASSUMPTIONS.parkFeeBps.value, 50);
}

/** One day of a car's published telemetry. */
export interface DayReport {
  /** YYYYMMDD */
  date: number;
  status: DayStatus;
  trips: number;
  km: number;
  rentPaidKzt: number;
}

/** A car's month: its daily telemetry and the P&L the operator deposits from. */
export interface MonthReport {
  month: Month;
  days: DayReport[];
  rentCollectedKzt: number;
  parkFeeKzt: number;
  maintenanceKzt: number;
  insuranceKzt: number;
  repairsKzt: number;
  /** Maintenance cost drawn for the month, in basis points of rent collected. */
  maintenanceBps: number;
  /** Loss of earlier months netted against this one. */
  carriedLossKzt: number;
  /** What the operator deposits; zero when costs exceed income. */
  distributableKzt: number;
  /** Loss carried into the next month. */
  lossCarriedForwardKzt: number;
}

export interface MonthInput {
  rng: Rng;
  month: Month;
  car: CarEconomics;
  parkFeeBps: number;
  /** Day of the month an accident takes the car off the road. */
  accidentDay?: number;
  carriedLossKzt: number;
}

function bps(amount: number, basisPoints: number): number {
  return Math.floor((amount * basisPoints) / 10_000);
}

export function simulateMonth(input: MonthInput): MonthReport {
  const { rng, month, car } = input;
  const length = daysInMonth(month);
  const statuses: Array<DayStatus | undefined> = Array.from({ length }, () => undefined);

  let repairsKzt = 0;
  if (input.accidentDay !== undefined) {
    const downtime = between(rng, ASSUMPTIONS.accidentDowntimeDays.value);
    const lastRepairDay = Math.min(length, input.accidentDay + downtime - 1);
    for (let day = input.accidentDay; day <= lastRepairDay; day++) {
      statuses[day - 1] = "repair";
    }
    repairsKzt = between(rng, ASSUMPTIONS.accidentDeductibleKzt.value, 5_000);
  }

  const free = () => statuses.flatMap((status, i) => (status === undefined ? [i] : []));
  const maintenance = between(rng, ASSUMPTIONS.scheduledMaintenanceDays.value);
  for (const i of rng.shuffle(free()).slice(0, maintenance)) {
    statuses[i] = "maintenance";
  }
  const winterDrop = WINTER_MONTHS.has(month.month) ? between(rng, ASSUMPTIONS.winterDropDays.value) : 0;
  const working = between(rng, ASSUMPTIONS.workingDaysPerMonth.value) - winterDrop;
  const open = free();
  const active = new Set(rng.shuffle(open).slice(0, Math.min(working, open.length)));
  for (const i of open) {
    statuses[i] = active.has(i) ? "active" : "idle";
  }

  const trips = ASSUMPTIONS.tripsPerRentedDay.value;
  const days = statuses.map((status, i): DayReport => {
    const date = yyyymmdd(month, i + 1);
    if (status !== "active") {
      return { date, status: status ?? "idle", trips: 0, km: 0, rentPaidKzt: 0 };
    }
    const dayTrips = rng.normalInt(trips.mean, trips.sd, trips.min, trips.max);
    let km = 0;
    for (let trip = 0; trip < dayTrips; trip++) {
      km += between(rng, ASSUMPTIONS.kmPerTrip.value);
    }
    return { date, status, trips: dayTrips, km, rentPaidKzt: car.dailyRentKzt };
  });

  const rentCollectedKzt = days.reduce((sum, day) => sum + day.rentPaidKzt, 0);
  const parkFeeKzt = bps(rentCollectedKzt, input.parkFeeBps);
  const maintenanceBps = between(rng, ASSUMPTIONS.maintenanceCostBps.value, 10);
  const maintenanceKzt = bps(rentCollectedKzt, maintenanceBps);
  const insuranceKzt = Math.round(car.insuranceKztPerYear / 12);
  const result =
    rentCollectedKzt - parkFeeKzt - maintenanceKzt - insuranceKzt - repairsKzt - input.carriedLossKzt;
  return {
    month,
    days,
    rentCollectedKzt,
    parkFeeKzt,
    maintenanceKzt,
    insuranceKzt,
    repairsKzt,
    maintenanceBps,
    carriedLossKzt: input.carriedLossKzt,
    distributableKzt: Math.max(0, result),
    lossCarriedForwardKzt: Math.max(0, -result),
  };
}

/**
 * Sale price after `monthsOwned`: linear depreciation from the purchase price to the
 * residual value at the end of the depreciation period, rounded down to 10 000 tenge.
 */
export function salePriceKzt(car: CarEconomics, monthsOwned: number): number {
  const lifeMonths = car.depreciationYears * 12;
  const depreciation =
    (car.priceKzt * (10_000 - car.residualValueBps) * Math.min(monthsOwned, lifeMonths)) / (10_000 * lifeMonths);
  return Math.floor((car.priceKzt - depreciation) / 10_000) * 10_000;
}
