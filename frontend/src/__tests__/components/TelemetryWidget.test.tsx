import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../messages/en.json';
import { TelemetryWidget } from '@/components/asset/TelemetryWidget';
import type { TelemetryData } from '@/types/telemetry';

const API = 'https://api.axel.example';

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
    ...data,
  };
}

/** The backend's answer for each car, by the path it was asked for. */
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

function answer(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function renderWidget(projectId = 'MintA', apiUrl: string | null = API) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <TelemetryWidget projectId={projectId} apiUrl={apiUrl} />
    </NextIntlClientProvider>,
  );
  return {
    ...view,
    showCar: (id: string) =>
      view.rerender(
        <NextIntlClientProvider locale="en" messages={messagesEn}>
          <TelemetryWidget projectId={id} apiUrl={apiUrl} />
        </NextIntlClientProvider>,
      ),
  };
}

describe('TelemetryWidget', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says trip data is not connected when the deployment has no telemetry API', () => {
    renderWidget('MintA', null);

    expect(screen.getByTestId('telemetry-empty')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows placeholders while the backend answers', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderWidget();

    expect(screen.getByTestId('telemetry-loading')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`${API}/telemetry/latest/MintA`, expect.anything());
  });

  it("shows the car's figures, with income in tenge", async () => {
    fetchMock.mockReturnValue(answer(day()));
    renderWidget();

    expect(await screen.findByText('₸153.25')).toBeInTheDocument();
    expect(screen.getByText('On the road')).toBeInTheDocument();
    expect(screen.getByText('45,120 km')).toBeInTheDocument();
    expect(screen.queryByTestId('telemetry-stale')).not.toBeInTheDocument();
  });

  it('says so when the backend has nothing for the car', async () => {
    fetchMock.mockReturnValue(answer(day({ available: false, date: '', carStatus: '' })));
    renderWidget();

    expect(await screen.findByTestId('telemetry-empty')).toBeInTheDocument();
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
      url.endsWith('/MintA') ? answer(day({ tripsCount: 18 })) : new Promise(() => {}),
    );
    const { showCar } = renderWidget('MintA');
    expect(await screen.findByText('18')).toBeInTheDocument();

    showCar('MintB');

    expect(fetchMock).toHaveBeenLastCalledWith(`${API}/telemetry/latest/MintB`, expect.anything());
    expect(screen.getByTestId('telemetry-loading')).toBeInTheDocument();
    expect(screen.queryByText('18')).not.toBeInTheDocument();
  });
});
