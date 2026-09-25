import { createHash } from 'crypto';

import { EMPTY_HEAD, nextHead, publishDay } from './day-record';

const MINT = 'AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi';

describe('published day record', () => {
  it('is the RFC 8785 form of the record, and its hash is the SHA-256 of exactly that text', () => {
    const day = publishDay(
      MINT,
      '2026-09-24',
      300,
      { status: 'active', trips: 17, km: 143, rentCharged: 12_000 },
      'yandex_fleet',
    );

    expect(day.canonical).toBe(
      `{"currency":"KZT","data_origin":"yandex_fleet","date":"2026-09-24","km":143,"mint":"${MINT}",` +
        '"rent_charged":12000,"schema":"axel.telemetry.day/v1","status":"active","trips":17,"utc_offset":"+05:00"}',
    );
    expect(day.dataHash).toBe(createHash('sha256').update(day.canonical).digest('hex'));
  });

  it('marks simulated figures as simulated inside the hashed text', () => {
    const figures = { status: 'idle', trips: 0, km: 0, rentCharged: 0 } as const;

    const simulated = publishDay(MINT, '2026-09-24', 300, figures, 'simulated');
    const real = publishDay(MINT, '2026-09-24', 300, figures, 'yandex_fleet');

    expect(simulated.record.data_origin).toBe('simulated');
    expect(simulated.canonical).toContain('"data_origin":"simulated"');
    expect(simulated.dataHash).not.toBe(real.dataHash);
  });

  it.each([
    ['trips', { trips: 65_536, km: 1, rentCharged: 1 }],
    ['km', { trips: 1, km: -1, rentCharged: 1 }],
    ['rentCharged', { trips: 1, km: 1, rentCharged: 12_000.5 }],
  ])('refuses %s that does not fit the on-chain entry', (field, values) => {
    expect(() =>
      publishDay(MINT, '2026-09-24', 300, { status: 'active', ...values }, 'simulated'),
    ).toThrow(new RegExp(`^${field} for ${MINT} on 2026-09-24 is out of range`));
  });
});

describe('telemetry chain step', () => {
  it('matches the reference heads the program is tested against', () => {
    // Same vectors as programs/axel-v2/src/telemetry.rs.
    const first = nextHead(EMPTY_HEAD, '2026-10-01', '11'.repeat(32));
    const second = nextHead(first, '2026-10-02', '22'.repeat(32));

    expect(first).toBe('9cda215c2d7196bacfa2ba5c6b6b49fd715cdefa07dac71a7a4d54253e315e0d');
    expect(second).toBe('5408cc2e761e8f551820d65088f7ccafe180834d659dde923aaad56baa82291c');
  });
});
