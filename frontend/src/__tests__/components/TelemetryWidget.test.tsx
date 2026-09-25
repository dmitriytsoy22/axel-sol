import React from 'react';
import { createHash, webcrypto } from 'node:crypto';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PublicKey } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../messages/en.json';
import { TelemetryWidget } from '@/components/asset/TelemetryWidget';
import { canonicalize } from '@/lib/verify/jcs';
import { NotPublishedError, type JsonFetcher } from '@/lib/verify/published';
import type { Digest } from '@/lib/verify/sha256';
import { EMPTY_HEAD } from '@/lib/verify/telemetry';
import type { TelemetryData } from '@/types/telemetry';

const API = 'https://api.axel.example';
const DATA = 'https://data.axel.example';
const MINT_A = 'FvJbFZYZdd4GwbYQS1zbWcbuPBqeHWnYdAt1ratzi1yv';
const MINT_B = '7AtWj73mYMvnN4w2Ct8TTBeEen7YM5FdPPRdM1JKmfZ4';

const digest: Digest = async (data) =>
  new Uint8Array(await webcrypto.subtle.digest('SHA-256', data));
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function nextHead(previous: string, date: string, dataHash: string): string {
  const day = Buffer.alloc(4);
  day.writeUInt32LE(Number(date.replaceAll('-', '')));
  return sha256(Buffer.concat([Buffer.from(previous, 'hex'), day, Buffer.from(dataHash, 'hex')]));
}

function day(data: Partial<TelemetryData> = {}): TelemetryData {
  return {
    date: new Date().toISOString().slice(0, 10),
    dailyRevenue: 153.25,
    mileageKm: 45_120,
    tripsCount: 18,
    carStatus: 'active',
    dataHash: 'ab'.repeat(32),
    solanaTxSignature: null,
    stale: false,
    available: true,
    dataOrigin: 'yandex_fleet',
    ...data,
  };
}

/** A day as the demo seed publishes it. */
function seedRecord(date: string, trips: number, rent: number, status = 'active') {
  return {
    schema: 'axel.telemetry.day/v1',
    data_origin: 'devnet-demo-seed',
    mint: MINT_A,
    date,
    status,
    status_code: status === 'active' ? 1 : 3,
    trips,
    km: trips * 8,
    rent_paid_kzt: rent,
  };
}

/**
 * Two published months of car A: two days in August and two in September, of which the chain
 * has recorded the first `recorded`. Returns the files and the chain's telemetry.
 */
function publishedCar({ headBefore = true, recorded = 3 } = {}) {
  const records = [
    seedRecord('2026-08-30', 17, 11_000),
    seedRecord('2026-08-31', 21, 12_000),
    seedRecord('2026-09-01', 0, 0, 'maintenance'),
    seedRecord('2026-09-02', 19, 11_500),
  ];
  const heads: string[] = [];
  let head = EMPTY_HEAD;
  for (const record of records) {
    head = nextHead(head, record.date, sha256(canonicalize(record)));
    heads.push(head);
  }
  const month = (days: typeof records, before: string) => ({
    schema: 'axel.telemetry.month/v1',
    ...(headBefore ? { head_before: before } : {}),
    days: days.map((record) => ({ record })),
  });
  const folder = `${DATA}/${MINT_A}`;
  return {
    files: {
      [`${folder}/index.json`]: {
        mint: MINT_A,
        data_origin: 'devnet-demo-seed',
        telemetry: {
          months: [
            { month: '2026-08', file: 'telemetry/2026-08.json' },
            { month: '2026-09', file: 'telemetry/2026-09.json' },
          ],
        },
        reports: [],
        acquisition: null,
      },
      [`${folder}/telemetry/2026-08.json`]: month(records.slice(0, 2), EMPTY_HEAD),
      [`${folder}/telemetry/2026-09.json`]: month(records.slice(2), heads[1]),
    } as Record<string, unknown>,
    chain: {
      shareMint: new PublicKey(MINT_A),
      telemetryHead: heads[recorded - 1],
      telemetryCount: recorded,
      lastTelemetryDate: Number(records[recorded - 1].date.replaceAll('-', '')),
    },
  };
}

function fetcherOf(files: Record<string, unknown>): JsonFetcher & { urls: string[] } {
  const urls: string[] = [];
  const fetcher = async (url: string) => {
    urls.push(url);
    if (!(url in files)) throw new NotPublishedError(url);
    return JSON.parse(JSON.stringify(files[url]));
  };
  return Object.assign(fetcher, { urls });
}

type Car = React.ComponentProps<typeof TelemetryWidget>['project'];

const carWithoutDays = (mint: string): Car => ({
  shareMint: new PublicKey(mint),
  telemetryHead: EMPTY_HEAD,
  telemetryCount: 0,
  lastTelemetryDate: 0,
});

/** The backend's answer for each car, by the path it was asked for. */
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

function answer(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function renderWidget(
  project: Car = carWithoutDays(MINT_A),
  {
    apiUrl = API,
    publishedUrl = null,
    fetcher = fetcherOf({}),
  }: { apiUrl?: string | null; publishedUrl?: string | null; fetcher?: JsonFetcher } = {},
) {
  const widget = (car: Car) => (
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <TelemetryWidget
        project={car}
        apiUrl={apiUrl}
        publishedUrl={publishedUrl}
        digest={digest}
        fetcher={fetcher}
      />
    </NextIntlClientProvider>
  );
  const view = render(widget(project));
  return { ...view, showCar: (car: Car) => view.rerender(widget(car)) };
}

const figure = (label: string) =>
  within(screen.getByTestId('telemetry-widget')).getByText(label, { selector: 'dt' })
    .nextElementSibling;

describe('TelemetryWidget', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('from the backend', () => {
    it('says trip data is not connected when the deployment has neither a backend nor published data', () => {
      renderWidget(carWithoutDays(MINT_A), { apiUrl: null });

      expect(screen.getByTestId('telemetry-empty')).toHaveTextContent(
        "Trip data isn't connected for this car yet.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows placeholders while the backend answers', () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      renderWidget();

      expect(screen.getByTestId('telemetry-loading')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        `${API}/telemetry/latest/${MINT_A}`,
        expect.anything(),
      );
    });

    it("shows the car's figures with income in tenge, and names the fleet as their source", async () => {
      fetchMock.mockReturnValue(answer(day({ solanaTxSignature: 'DaySig' })));
      renderWidget();

      expect(await screen.findByText('₸153.25')).toBeInTheDocument();
      expect(screen.getByText('On the road')).toBeInTheDocument();
      expect(figure('Distance')).toHaveTextContent('45,120 km');
      expect(screen.getByText('Yandex Fleet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Recorded on Solana/ })).toHaveAttribute(
        'href',
        expect.stringContaining('/tx/DaySig'),
      );
      expect(screen.queryByTestId('telemetry-stale')).not.toBeInTheDocument();
    });

    it('labels simulated figures as simulated', async () => {
      fetchMock.mockReturnValue(answer(day({ dataOrigin: 'simulated' })));
      renderWidget();

      expect(await screen.findByText('Simulated')).toBeInTheDocument();
      expect(screen.queryByText('Yandex Fleet')).not.toBeInTheDocument();
    });

    it('explains a backend that cannot be reached instead of showing nothing', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      renderWidget();

      expect(await screen.findByTestId('telemetry-error')).toHaveTextContent(
        "Couldn't reach the trip data service.",
      );
    });

    it('refuses an answer that is not the documented shape', async () => {
      fetchMock.mockReturnValue(answer({ available: true }));
      renderWidget();

      expect(await screen.findByTestId('telemetry-error')).toBeInTheDocument();
    });

    it('marks figures of an old day as stale, with the day', async () => {
      fetchMock.mockReturnValue(answer(day({ date: '2026-09-01', stale: true })));
      renderWidget();

      expect(await screen.findByTestId('telemetry-stale')).toHaveTextContent(
        'Latest figures are for Sep 1, 2026',
      );
    });

    it("reads the new car's data when the page switches cars, never showing the old car's", async () => {
      fetchMock.mockImplementation((url) =>
        url.endsWith(`/${MINT_A}`) ? answer(day({ tripsCount: 18 })) : new Promise(() => {}),
      );
      const { showCar } = renderWidget(carWithoutDays(MINT_A));
      expect(await screen.findByText('18')).toBeInTheDocument();

      showCar(carWithoutDays(MINT_B));

      expect(fetchMock).toHaveBeenLastCalledWith(
        `${API}/telemetry/latest/${MINT_B}`,
        expect.anything(),
      );
      expect(screen.getByTestId('telemetry-loading')).toBeInTheDocument();
      expect(screen.queryByText('18')).not.toBeInTheDocument();
    });
  });

  describe('from the published files, for a car the backend has no data for', () => {
    it("shows the chain's last recorded day, matched in the browser, labelled as demo data", async () => {
      fetchMock.mockReturnValue(answer(day({ available: false, date: '', dataOrigin: null })));
      const { files, chain } = publishedCar();
      renderWidget(chain, { publishedUrl: DATA, fetcher: fetcherOf(files) });

      // 2026-09-01 is the chain's last day; the published 2026-09-02 is not recorded yet.
      expect(await screen.findByText('In maintenance')).toBeInTheDocument();
      expect(figure('Trips')).toHaveTextContent('0');
      expect(screen.getByTestId('telemetry-stale')).toHaveTextContent('Sep 1, 2026');
      expect(screen.getByText('Fictional demo data')).toBeInTheDocument();
      expect(
        screen.getByText(/matched in your browser to day 3 of the car's chain/),
      ).toBeInTheDocument();
    });

    it('reads them without asking anyone when the deployment has no backend', async () => {
      const { files, chain } = publishedCar({ recorded: 2 });
      renderWidget(chain, { apiUrl: null, publishedUrl: DATA, fetcher: fetcherOf(files) });

      expect(await screen.findByText('₸12,000')).toBeInTheDocument();
      expect(screen.getByText('On the road')).toBeInTheDocument();
      expect(figure('Trips')).toHaveTextContent('21');
      expect(figure('Distance')).toHaveTextContent('168 km');
      expect(screen.getByText(/day 2 of the car's chain/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rebuilds the chain from its first month when a month does not state where it starts', async () => {
      const { files, chain } = publishedCar({ headBefore: false });
      const fetcher = fetcherOf(files);
      renderWidget(chain, { apiUrl: null, publishedUrl: DATA, fetcher });

      expect(await screen.findByText('In maintenance')).toBeInTheDocument();
      expect(fetcher.urls).toContain(`${DATA}/${MINT_A}/telemetry/2026-08.json`);
    });

    it('shows no figures when the published records do not rebuild the head on Solana', async () => {
      const { files, chain } = publishedCar();
      renderWidget(
        { ...chain, telemetryHead: 'ab'.repeat(32) },
        { apiUrl: null, publishedUrl: DATA, fetcher: fetcherOf(files) },
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "The published trip data doesn't match what Solana holds for this car",
      );
      expect(screen.queryByTestId('telemetry-widget')).not.toBeInTheDocument();
    });

    it('says the chain holds no day yet, without downloading anything', async () => {
      const fetcher = fetcherOf({});
      renderWidget(carWithoutDays(MINT_A), { apiUrl: null, publishedUrl: DATA, fetcher });

      expect(screen.getByTestId('telemetry-empty')).toHaveTextContent(
        'Solana holds no trip days for this car yet.',
      );
      expect(fetcher.urls).toEqual([]);
    });

    it("says so when the chain's last day is not published", async () => {
      const { files, chain } = publishedCar();
      renderWidget(
        { ...chain, lastTelemetryDate: 20261001 },
        { apiUrl: null, publishedUrl: DATA, fetcher: fetcherOf(files) },
      );

      expect(await screen.findByTestId('telemetry-empty')).toHaveTextContent(
        "The car's last recorded day isn't published yet",
      );
    });

    it('explains published files that cannot be read', async () => {
      const { chain } = publishedCar();
      renderWidget(chain, {
        apiUrl: null,
        publishedUrl: DATA,
        fetcher: async () => {
          throw new TypeError('Failed to fetch');
        },
      });

      expect(await screen.findByTestId('telemetry-error')).toHaveTextContent(
        "Couldn't read the car's published trip data.",
      );
    });
  });
});
