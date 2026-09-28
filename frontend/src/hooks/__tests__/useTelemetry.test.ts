// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isStaleDay } from '../useTelemetry';

// The fleet's days end at midnight in Almaty (UTC+5), 19:00 UTC, and are collected at 01:00.
describe('isStaleDay', () => {
  it("keeps yesterday fresh all day today, after UTC's afternoon too", () => {
    expect(isStaleDay('2026-09-27', Date.parse('2026-09-28T15:17:00Z'))).toBe(false);
    expect(isStaleDay('2026-09-27', Date.parse('2026-09-28T18:59:00Z'))).toBe(false);
  });

  it('keeps a day fresh through the night its successor is collected in', () => {
    // 04:30 in Almaty on the 29th: the 28th may not be collected yet.
    expect(isStaleDay('2026-09-27', Date.parse('2026-09-28T23:30:00Z'))).toBe(false);
  });

  it('marks a day stale once the next one should have been collected', () => {
    // 07:00 in Almaty on the 29th.
    expect(isStaleDay('2026-09-27', Date.parse('2026-09-29T02:00:00Z'))).toBe(true);
    expect(isStaleDay('2026-09-01', Date.parse('2026-09-28T12:00:00Z'))).toBe(true);
  });

  it("never calls today's figures stale", () => {
    expect(isStaleDay('2026-09-28', Date.parse('2026-09-28T01:00:00Z'))).toBe(false);
  });

  it('says nothing about a day it cannot read', () => {
    expect(isStaleDay('', Date.parse('2026-09-28T12:00:00Z'))).toBe(false);
  });
});
