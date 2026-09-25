import { Keypair, PublicKey } from '@solana/web3.js';

import { eachDay } from '../common/dates';
import type { SimulatedCar } from './fleet-config';
import { simulateDay } from './simulated-fleet';

function car(mint = Keypair.generate().publicKey): SimulatedCar {
  return {
    mint,
    mintAddress: mint.toBase58(),
    plate: '777AXL02',
    source: 'simulated',
    parkFeeBps: 1500,
    simulatedDailyRent: 12_000,
    startDate: null,
  };
}

describe('simulateDay', () => {
  it('gives the same figures for the same car and day, so a published day can be reproduced', () => {
    const cobalt = car();

    expect(simulateDay(cobalt, '2026-09-24')).toEqual(simulateDay({ ...cobalt }, '2026-09-24'));
  });

  it('follows the stated assumptions over a year of days', () => {
    // A fixed car keeps the proportions below a fixed fact rather than a likely one.
    const cobalt = car(new PublicKey('AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi'));
    const days = eachDay('2026-01-01', '2026-12-31').map((date) => simulateDay(cobalt, date));
    const share = (status: string): number =>
      days.filter((day) => day.status === status).length / days.length;

    const active = days.filter((day) => day.status === 'active');
    const inactive = days.filter((day) => day.status !== 'active');

    expect(share('active')).toBeGreaterThan(0.78);
    expect(share('active')).toBeLessThan(0.92);
    expect(share('maintenance')).toBeGreaterThan(0.01);
    expect(share('idle')).toBeGreaterThan(0.05);
    expect(new Set(active.map((day) => day.rentCharged))).toEqual(new Set([12_000]));
    expect(active.filter((day) => day.trips < 12 || day.trips > 24)).toEqual([]);
    expect(active.filter((day) => day.km < day.trips * 6 || day.km > day.trips * 12)).toEqual([]);
    expect(inactive.filter((day) => day.trips + day.km + day.rentCharged !== 0)).toEqual([]);
  });
});
