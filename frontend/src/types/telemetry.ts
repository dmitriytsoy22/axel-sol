/** GET /telemetry/latest/:projectId of the AXEL backend (docs/api.md). */
export interface TelemetryData {
  /** "YYYY-MM-DD" (UTC), the day the figures cover; empty when nothing is cached. */
  date: string;
  /** Tenge. */
  dailyRevenue: number;
  mileageKm: number;
  tripsCount: number;
  /** "active" or "inactive"; empty when nothing is cached. */
  carStatus: string;
  dataHash: string;
  solanaTxSignature: string | null;
  stale: boolean;
  available: boolean;
  /** `yandex_fleet` or `simulated`; null when the backend has no day for the car. */
  dataOrigin: string | null;
}
