export interface TelemetryData {
  projectId: string;
  date: string; // ISO date
  dailyRevenue: number; // тенге
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive';
  dataHash: string;
  oracleSignature: string;
  solanaTxSignature: string;
  stale: boolean;
  available: boolean;
}
