export interface VehiclePhoto {
  src: string;
  /** True when the stock photo shows the named model; false for the generic Almaty fallback. */
  showsModel: boolean;
}

/*
 * Licensed stock photos of each model (see public/images/CREDITS.md). They illustrate the
 * model, not the tokenized car, so the UI marks them as illustrative. Keys are
 * "<make> <model>", lowercase.
 */
const MODEL_PHOTOS: Record<string, string> = {
  'toyota camry': '/images/cars/toyota-camry.webp',
  'hyundai sonata': '/images/cars/hyundai-sonata.webp',
  'hyundai elantra': '/images/cars/hyundai-elantra.webp',
  'hyundai accent': '/images/cars/hyundai-accent.webp',
  'kia k5': '/images/cars/kia-k5.webp',
  'kia rio': '/images/cars/kia-rio.webp',
};

export const FALLBACK_VEHICLE_PHOTO = '/images/places/almaty-taxi-mountains.webp';

export function vehiclePhoto(make: string, model: string): VehiclePhoto {
  const key = `${make} ${model}`.trim().replace(/\s+/g, ' ').toLowerCase();
  const src = MODEL_PHOTOS[key];
  return src ? { src, showsModel: true } : { src: FALLBACK_VEHICLE_PHOTO, showsModel: false };
}
