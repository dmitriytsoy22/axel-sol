import { jurisdictionFromCountry } from './jurisdiction';

describe('jurisdictionFromCountry', () => {
  it.each<[string | null, number]>([
    ['KAZ', 398],
    ['kaz', 398],
    ['AFG', 4],
    ['UZB', 860],
    ['XXX', 0],
    [null, 0],
  ])('maps %p to %p', (alpha3, numeric) => {
    expect(jurisdictionFromCountry(alpha3)).toBe(numeric);
  });
});
