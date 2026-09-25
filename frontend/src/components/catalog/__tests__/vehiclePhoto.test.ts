import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { FALLBACK_VEHICLE_PHOTO, vehiclePhoto } from '../vehiclePhoto';

const PUBLIC_DIR = path.resolve(__dirname, '../../../../public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

function listImages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listImages(full);
    return /\.(webp|jpe?g|png|avif)$/.test(entry.name) ? [path.relative(IMAGES_DIR, full)] : [];
  });
}

describe('vehiclePhoto', () => {
  it.each([
    ['Toyota', 'Camry', 'toyota-camry'],
    ['Hyundai', 'Sonata', 'hyundai-sonata'],
    ['Hyundai', 'Elantra', 'hyundai-elantra'],
    ['Hyundai', 'Accent', 'hyundai-accent'],
    ['Kia', 'K5', 'kia-k5'],
    ['Kia', 'Rio', 'kia-rio'],
  ])('shows the %s %s photo for that model', (make, model, file) => {
    const photo = vehiclePhoto(make, model);

    expect(photo).toEqual({ src: `/images/cars/${file}.webp`, showsModel: true });
    expect(fs.existsSync(path.join(PUBLIC_DIR, photo.src))).toBe(true);
  });

  it('matches make and model regardless of case and stray spaces', () => {
    expect(vehiclePhoto('  TOYOTA ', 'camry  ').src).toBe('/images/cars/toyota-camry.webp');
  });

  it.each([
    ['Chevrolet', 'Cobalt'],
    ['Chevrolet', 'Onix'],
    ['JAC', 'J7'],
    ['', ''],
  ])("uses the Almaty fallback, not a model photo, for '%s %s'", (make, model) => {
    expect(vehiclePhoto(make, model)).toEqual({ src: FALLBACK_VEHICLE_PHOTO, showsModel: false });
  });

  it('points the fallback at an existing image', () => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, FALLBACK_VEHICLE_PHOTO))).toBe(true);
  });
});

describe('public/images', () => {
  const images = listImages(IMAGES_DIR);

  it('contains the photo set', () => {
    expect(images.length).toBeGreaterThanOrEqual(10);
  });

  it('credits every image in CREDITS.md', () => {
    const credits = fs.readFileSync(path.join(IMAGES_DIR, 'CREDITS.md'), 'utf8');
    const uncredited = images.filter((file) => !credits.includes(`\`${file}\``));

    expect(uncredited).toEqual([]);
  });

  it('keeps every image within its size budget', () => {
    const BUDGET_KB: Record<string, number> = { hero: 250, cars: 120 };
    const budgetKb = (file: string): number => BUDGET_KB[file.split(path.sep)[0]] ?? 150;
    const overBudget = images.filter(
      (file) => fs.statSync(path.join(IMAGES_DIR, file)).size > budgetKb(file) * 1024,
    );

    expect(overBudget).toEqual([]);
  });
});
