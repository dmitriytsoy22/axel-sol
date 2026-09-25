/**
 * Car models, classes, cities and parks the demo fleet is drawn from. Everything here is
 * fictional demo data: the parks do not exist, and the prices are assumptions (see
 * `economics.ts`) that must be checked against kolesa.kz / olx.kz listings before the pitch.
 */

/** Yandex Go tariff classes the cars are rented out for. */
export const CAR_CLASSES = ["economy", "comfort", "comfort+"] as const;
export type CarClass = (typeof CAR_CLASSES)[number];

export interface CarModel {
  make: string;
  model: string;
  /** URL-safe name, also the file name of the photo when there is one. */
  slug: string;
  carClass: CarClass;
  /** ASSUMPTION: new-car price range in tenge, 2026. */
  priceKzt: readonly [number, number];
  /** Relative frequency among Kazakhstan taxi fleets. ASSUMPTION, not market data. */
  popularity: number;
  /** Photo in `frontend/public/images/cars/`, if the repo has one for the model. */
  hasPhoto: boolean;
}

/** Models commonly seen in Kazakhstan taxi fleets. */
export const CAR_MODELS: readonly CarModel[] = [
  { make: "Chevrolet", model: "Cobalt", slug: "chevrolet-cobalt", carClass: "economy", priceKzt: [7_000_000, 7_800_000], popularity: 6, hasPhoto: false },
  { make: "Chevrolet", model: "Onix", slug: "chevrolet-onix", carClass: "economy", priceKzt: [7_800_000, 9_000_000], popularity: 3, hasPhoto: false },
  { make: "Hyundai", model: "Accent", slug: "hyundai-accent", carClass: "economy", priceKzt: [8_500_000, 10_000_000], popularity: 4, hasPhoto: true },
  { make: "Kia", model: "Rio", slug: "kia-rio", carClass: "economy", priceKzt: [8_500_000, 10_000_000], popularity: 3, hasPhoto: true },
  { make: "Hyundai", model: "Elantra", slug: "hyundai-elantra", carClass: "comfort", priceKzt: [11_000_000, 13_000_000], popularity: 2, hasPhoto: true },
  { make: "JAC", model: "J7", slug: "jac-j7", carClass: "comfort", priceKzt: [9_000_000, 10_500_000], popularity: 2, hasPhoto: false },
  { make: "Kia", model: "K5", slug: "kia-k5", carClass: "comfort+", priceKzt: [14_000_000, 16_500_000], popularity: 1, hasPhoto: true },
  { make: "Hyundai", model: "Sonata", slug: "hyundai-sonata", carClass: "comfort+", priceKzt: [15_000_000, 17_500_000], popularity: 1, hasPhoto: true },
  { make: "Toyota", model: "Camry", slug: "toyota-camry", carClass: "comfort+", priceKzt: [18_000_000, 21_000_000], popularity: 1, hasPhoto: true },
];

export interface City {
  name: string;
  /** Region code on Kazakhstan licence plates. */
  plateRegion: string;
}

export const CITIES = {
  almaty: { name: "Almaty", plateRegion: "02" },
  astana: { name: "Astana", plateRegion: "01" },
  shymkent: { name: "Shymkent", plateRegion: "17" },
} as const satisfies Record<string, City>;

export type CityId = keyof typeof CITIES;

export interface Park {
  id: string;
  /** Always starts with "Demo Park": these fleets are fictional. */
  name: string;
  city: CityId;
  /** Share of the cars in the demo fleet, relative to the other parks. */
  weight: number;
}

/** Four fictional taxi parks that operate the demo cars. */
export const PARKS: readonly Park[] = [
  { id: "almaty-1", name: "Demo Park Almaty-1", city: "almaty", weight: 3 },
  { id: "almaty-2", name: "Demo Park Almaty-2", city: "almaty", weight: 2 },
  { id: "astana", name: "Demo Park Astana", city: "astana", weight: 2 },
  { id: "shymkent", name: "Demo Park Shymkent", city: "shymkent", weight: 1 },
];

/** Model years the demo cars are drawn from; taxi fleets run recent cars. */
export const MODEL_YEARS = [2023, 2024, 2025] as const;

/**
 * A plate that cannot belong to a real car ("DEMO" is not a valid series). Only its hash
 * is published.
 */
export function demoPlate(carNumber: number, city: CityId): string {
  return `DEMO ${String(carNumber).padStart(3, "0")} ${CITIES[city].plateRegion}`;
}
