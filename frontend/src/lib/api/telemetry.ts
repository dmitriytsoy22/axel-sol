/**
 * Telemetry API Client
 *
 * The ONLY backend call in the entire AXEL frontend.
 * Fetches latest telemetry data from Yandex Pro via our backend proxy.
 *
 * Endpoint: GET /telemetry/latest/:project_id
 */

const TELEMETRY_API_URL =
  process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://localhost:3001';

export interface TelemetryResponse {
  projectId: string;
  date: string;
  dailyRevenue: number;
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive';
  dataHash: string;
  oracleSignature: string;
  solanaTxSignature: string;
  stale: boolean;
  available: boolean;
}

/**
 * Fetch latest telemetry for a project.
 * On any error → returns fallback { available: false }.
 */
export async function fetchLatestTelemetry(
  projectId: string,
): Promise<TelemetryResponse> {
  const fallback: TelemetryResponse = {
    projectId,
    date: new Date().toISOString().split('T')[0],
    dailyRevenue: 0,
    mileageKm: 0,
    tripsCount: 0,
    carStatus: 'inactive',
    dataHash: '',
    oracleSignature: '',
    solanaTxSignature: '',
    stale: false,
    available: false,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `${TELEMETRY_API_URL}/telemetry/latest/${projectId}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[AXEL Telemetry] HTTP ${response.status} for project ${projectId}`);
      return fallback;
    }

    const data: TelemetryResponse = await response.json();
    return { ...data, available: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.warn(`[AXEL Telemetry] Timeout fetching project ${projectId}`);
    } else {
      console.warn(`[AXEL Telemetry] Network error for project ${projectId}:`, error);
    }
    return fallback;
  }
}
