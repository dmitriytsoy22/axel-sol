import {
  addDays,
  dateNumber,
  eachDay,
  formatUtcOffset,
  isIsoDate,
  isoFromDateNumber,
  localDate,
  parseUtcOffset,
  startOfDay,
} from './dates';

describe('calendar dates', () => {
  it.each(['2026-09-24', '2028-02-29', '2000-01-01', '9999-12-31'])('accepts %s', (date) => {
    expect(isIsoDate(date)).toBe(true);
  });

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '1999-12-31', '2026-9-24', '20260924', ''])(
    'refuses %s, which the program would not accept as a day',
    (date) => {
      expect(isIsoDate(date)).toBe(false);
    },
  );

  it('converts to and from the YYYYMMDD integer the program stores', () => {
    expect(dateNumber('2026-09-24')).toBe(20260924);
    expect(isoFromDateNumber(20260924)).toBe('2026-09-24');
  });

  it('steps across month and leap-year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([]);
  });

  it('reads and writes UTC offsets', () => {
    expect(parseUtcOffset('+05:00')).toBe(300);
    expect(parseUtcOffset('-03:30')).toBe(-210);
    expect(parseUtcOffset('+5')).toBeNull();
    expect(parseUtcOffset('+15:00')).toBeNull();
    expect(formatUtcOffset(300)).toBe('+05:00');
    expect(formatUtcOffset(-210)).toBe('-03:30');
  });

  it("uses the fleet's zone to decide which day it is", () => {
    // 20:30 UTC on the 24th is already 01:30 on the 25th in Almaty (UTC+5).
    const now = Date.parse('2026-09-24T20:30:00Z');

    expect(localDate(now, 0)).toBe('2026-09-24');
    expect(localDate(now, 300)).toBe('2026-09-25');
    expect(startOfDay('2026-09-25', 300)).toBe('2026-09-25T00:00:00+05:00');
  });
});
