import { createHash } from 'crypto';

import type { DayFigures } from '../telemetry/day-record';
import type { SimulatedCar } from './fleet-config';

/**
 * Deterministic stand-in for a car's day where no fleet system is connected. The same car
 * and day always give the same figures, and every record built from them is published with
 * `data_origin: "simulated"`.
 *
 * Assumptions from the design notes, not measured data: the car is rented out on 85% of
 * days, idle on 10% and in maintenance on 5%; a rented day has 12 to 24 trips of 6 to 12 km,
 * and the park charges the car's daily rent only on rented days.
 */
export function simulateDay(car: SimulatedCar, date: string): DayFigures {
  const seed = createHash('sha256')
    .update(`axel-simulation/v1|${car.mintAddress}|${date}`)
    .digest();
  const draw = (index: number): number => seed.readUInt32LE(index * 4) / 2 ** 32;

  const roll = draw(0);
  if (roll < 0.05) {
    return { status: 'maintenance', trips: 0, km: 0, rentCharged: 0 };
  }
  if (roll < 0.15) {
    return { status: 'idle', trips: 0, km: 0, rentCharged: 0 };
  }
  const trips = 12 + Math.floor(draw(1) * 13);
  const kmPerTrip = 6 + Math.floor(draw(2) * 7);
  return { status: 'active', trips, km: trips * kmPerTrip, rentCharged: car.simulatedDailyRent };
}
