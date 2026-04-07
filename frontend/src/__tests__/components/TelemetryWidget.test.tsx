import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryWidget } from '@/components/dashboard/TelemetryWidget';
import { NextIntlClientProvider } from 'next-intl';

// Mock messages
const messages = {
  Telemetry: {
    title: 'Live Telemetry',
    statusInService: 'In Service',
    statusMaintenance: 'Maintenance',
    statusInactive: "Inactive",
    dailyRevenue: 'Daily Revenue',
    mileage: 'Mileage',
    trips: 'Trips',
    emptyState: 'Telemetry data is currently unavailable.',
    staleData: 'Last updated: {time}',
    loading: "Loading telemetry..."
  },
  RpcError: {
    title: 'Connection Error',
    description: 'Failed to load',
    retry: 'Try Again'
  }
};

const renderWidget = () => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <TelemetryWidget projectId="testMintAddress" />
    </NextIntlClientProvider>
  );
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TelemetryWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // Return unresolved promise intentionally to keep loading true
    mockFetch.mockReturnValue(new Promise(() => {}));
    
    renderWidget();
    expect(screen.getByTestId('telemetry-loading')).toBeInTheDocument();
  });

  it('renders successful data correctly', async () => {
    const mockData = {
      carStatus: 'active',
      dailyRevenue: 153.25,
      mileageKm: 45120,
      tripsCount: 18,
      date: new Date().toISOString(),
      available: true
    };
    
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.queryByTestId('telemetry-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Live Telemetry')).toBeInTheDocument();
    expect(screen.getByText('In Service')).toBeInTheDocument();
    expect(screen.getByText('153.25')).toBeInTheDocument();
  });

  it('renders empty state when available: false', async () => {
    const mockData = {
      available: false
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.getByTestId('telemetry-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('Telemetry data is currently unavailable.')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderWidget();

    await waitFor(() => {
      expect(screen.getByText('Connection Error')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('handles stale data correctly', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const mockData = {
      carStatus: 'inactive',
      dailyRevenue: 0,
      mileageKm: 0,
      tripsCount: 0,
      date: twoHoursAgo,
      available: true
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    renderWidget();

    await waitFor(() => {
      expect(screen.queryByTestId('telemetry-loading')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('telemetry-stale')).toBeInTheDocument();
  });
});
