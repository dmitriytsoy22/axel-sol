// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '../jcs';
import { webCryptoSha256 } from '../sha256';
import {
  checkTelemetryChain,
  dateNumber,
  EMPTY_HEAD,
  nextHead,
  snapshotDay,
  type PublishedDay,
} from '../telemetry';

/** Node's own SHA-256, an implementation independent of the WebCrypto one under test. */
const nodeSha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** The program's step, written out with Node buffers. */
function nodeHead(head: string, date: number, dataHash: string): string {
  const day = Buffer.alloc(4);
  day.writeUInt32LE(date);
  return nodeSha256(Buffer.concat([Buffer.from(head, 'hex'), day, Buffer.from(dataHash, 'hex')]));
}

/** A day of trip data; its canonical JSON is written by hand below, not by the code under test. */
function day(date: string, trips: number, km: number) {
  const record = { schema: 'axel.telemetry.day/v1', date, trips, km };
  const canonical = `{"date":"${date}","km":${km},"schema":"axel.telemetry.day/v1","trips":${trips}}`;
  return { record, dataHash: nodeSha256(canonical) };
}

/** Days as a publisher writes them: each with its record hash and the head after it. */
function publish(days: ReturnType<typeof day>[]): PublishedDay[] {
  let head = EMPTY_HEAD;
  return days.map(({ record, dataHash }) => {
    head = nodeHead(head, dateNumber(record.date)!, dataHash);
    return { record, dataHash, head };
  });
}

const THREE_DAYS = [
  day('2026-10-01', 14, 212),
  day('2026-10-02', 11, 180),
  day('2026-10-04', 9, 131),
];

function onChainAfter(published: PublishedDay[], count: number) {
  return count === 0
    ? { head: EMPTY_HEAD, count: 0, lastDate: 0 }
    : {
        head: published[count - 1].head!,
        count,
        lastDate: dateNumber(published[count - 1].record.date)!,
      };
}

describe('nextHead', () => {
  it("reproduces the program's reference heads (programs/axel-v2/src/telemetry.rs)", async () => {
    const first = await nextHead(EMPTY_HEAD, 20261001, '11'.repeat(32), webCryptoSha256);
    const second = await nextHead(first, 20261002, '22'.repeat(32), webCryptoSha256);

    expect(first).toBe('9cda215c2d7196bacfa2ba5c6b6b49fd715cdefa07dac71a7a4d54253e315e0d');
    expect(second).toBe('5408cc2e761e8f551820d65088f7ccafe180834d659dde923aaad56baa82291c');
  });
});

describe('dateNumber', () => {
  it.each([
    ['2026-09-24', 20260924],
    ['2028-02-29', 20280229],
  ])('reads %s as %d', (text, number) => {
    expect(dateNumber(text)).toBe(number);
  });

  it.each(['2026-02-30', '2026-9-24', '1999-12-31', '20260924', 20260924, undefined])(
    'refuses %s, which the program would never record',
    (value) => {
      expect(dateNumber(value)).toBeNull();
    },
  );
});

describe('canonicalize', () => {
  it('writes the RFC 8785 §3.2.2 sample exactly as the RFC does', () => {
    const parsed = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],' +
        '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",' +
        '"literals":[null,true,false]}',
    );

    expect(canonicalize(parsed)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it('orders keys by UTF-16 code units, as RFC 8785 §3.2.3 sorts them', () => {
    const keys = ['€', '\r', 'דּ', '1', '😀', '\u0080', 'ö'];
    const text = canonicalize(Object.fromEntries(keys.map((key) => [key, 0])));

    // Checked as text: parsing it back would put the integer-like key "1" first again.
    expect(text).toBe(
      '{"\\r":0,"1":0,"\u0080":0,"\u00f6":0,"\u20ac":0,"\ud83d\ude00":0,"\ufb33":0}',
    );
  });

  it('refuses values JSON cannot carry instead of hashing something else', () => {
    expect(() => canonicalize({ km: Number.NaN })).toThrow('$.km');
    expect(() => canonicalize({ note: 'lone \ud800' })).toThrow('lone surrogate');
  });
});

describe('checkTelemetryChain', () => {
  it('matches when the published days rebuild the head, count and last day on-chain', async () => {
    const published = publish(THREE_DAYS);

    const check = await checkTelemetryChain(published, onChainAfter(published, 3), webCryptoSha256);

    expect(check.outcome).toBe('match');
    expect(check.problem).toBeNull();
    expect(check.head).toBe(published[2].head);
    expect(check.days.map((d) => d.date)).toEqual([20261001, 20261002, 20261004]);
  });

  it('matches without the hashes a publisher may leave out, since it recomputes them', async () => {
    const published = publish(THREE_DAYS);
    const bare = published.map(({ record }) => ({ record, dataHash: null, head: null }));

    const check = await checkTelemetryChain(bare, onChainAfter(published, 3), webCryptoSha256);

    expect(check.outcome).toBe('match');
  });

  it('reports newer published days the chain has not recorded yet as ahead', async () => {
    const published = publish(THREE_DAYS);

    const check = await checkTelemetryChain(published, onChainAfter(published, 2), webCryptoSha256);

    expect(check.outcome).toBe('ahead');
    expect(check.head).toBe(published[1].head);
  });

  it('cannot finish when the chain has recorded days nobody published', async () => {
    const published = publish(THREE_DAYS);

    const check = await checkTelemetryChain(
      published.slice(0, 2),
      onChainAfter(published, 3),
      webCryptoSha256,
    );

    expect(check.outcome).toBe('behind');
    expect(check.problem).toBeNull();
  });

  it('names the day whose figures were changed after publishing', async () => {
    const published = publish(THREE_DAYS);
    const tampered = published.map((entry, i) =>
      i === 1 ? { ...entry, record: { ...entry.record, km: 1800 } } : entry,
    );

    const check = await checkTelemetryChain(tampered, onChainAfter(published, 3), webCryptoSha256);

    expect(check.outcome).toBe('mismatch');
    expect(check.problem).toEqual({ index: 1, date: 20261002, kind: 'recordHash' });
    expect(check.days).toHaveLength(1);
  });

  it('catches a changed record even when its publisher rehashed it, at the chain head', async () => {
    const published = publish(THREE_DAYS);
    const rewritten = publish([THREE_DAYS[0], day('2026-10-02', 11, 1800), THREE_DAYS[2]]);

    const check = await checkTelemetryChain(rewritten, onChainAfter(published, 3), webCryptoSha256);

    expect(check.outcome).toBe('mismatch');
    expect(check.problem).toBeNull();
    expect(check.head).toBe(rewritten[2].head);
  });

  it('names a day whose published head is not the one the chain gives', async () => {
    const published = publish(THREE_DAYS);
    const wrongHead = published.map((entry, i) =>
      i === 2 ? { ...entry, head: EMPTY_HEAD } : entry,
    );

    const check = await checkTelemetryChain(wrongHead, onChainAfter(published, 3), webCryptoSha256);

    expect(check.problem).toEqual({ index: 2, date: 20261004, kind: 'statedHead' });
  });

  it('rejects days out of order or without a real date, which the program never records', async () => {
    // Bare records: a stated head would already flag the swapped day before its date does.
    const [first, second] = publish(THREE_DAYS).map(({ record }) => ({
      record,
      dataHash: null,
      head: null,
    }));
    const chain = { head: EMPTY_HEAD, count: 2, lastDate: 20261002 };

    const reordered = await checkTelemetryChain([second, first], chain, webCryptoSha256);
    const undated = await checkTelemetryChain(
      [first, { ...second, record: { ...second.record, date: '2026-10-32' } }],
      chain,
      webCryptoSha256,
    );

    expect(reordered.problem).toEqual({ index: 1, date: 20261001, kind: 'dateOrder' });
    expect(undated.problem).toEqual({ index: 1, date: null, kind: 'badDate' });
  });

  it('matches a car with no telemetry against the empty head', async () => {
    const check = await checkTelemetryChain(
      [],
      { head: EMPTY_HEAD, count: 0, lastDate: 0 },
      webCryptoSha256,
    );

    expect(check.outcome).toBe('match');
  });
});

describe('snapshotDay', () => {
  it("finds the day a deposit's telemetry snapshot points to", async () => {
    const published = publish(THREE_DAYS);
    const { days } = await checkTelemetryChain(
      published,
      onChainAfter(published, 3),
      webCryptoSha256,
    );

    expect(snapshotDay(days, published[1].head!)).toEqual(days[1]);
    expect(snapshotDay(days, EMPTY_HEAD)).toBe('none');
    expect(snapshotDay(days, 'ab'.repeat(32))).toBeNull();
  });
});
