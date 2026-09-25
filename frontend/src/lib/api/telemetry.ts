import { z } from 'zod';
import type { TelemetryData } from '@/types/telemetry';

/** Base URL of the AXEL backend's telemetry API; null when this deployment has none. */
export const TELEMETRY_API_URL =
  process.env.NEXT_PUBLIC_TELEMETRY_API_URL?.replace(/\/+$/, '') || null;

const TelemetrySchema = z.object({
  date: z.string(),
  dailyRevenue: z.number(),
  mileageKm: z.number(),
  tripsCount: z.number(),
  carStatus: z.string(),
  dataHash: z.string(),
  solanaTxSignature: z.string().nullable(),
  stale: z.boolean(),
  available: z.boolean(),
});

/** The newest day of trip data the backend holds for a project, by its share mint. */
export async function fetchLatestTelemetry(
  baseUrl: string,
  projectId: string,
  signal?: AbortSignal,
): Promise<TelemetryData> {
  const response = await fetch(`${baseUrl}/telemetry/latest/${encodeURIComponent(projectId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Telemetry API answered ${response.status}`);
  }
  return TelemetrySchema.parse(await response.json());
}
