# Image credits

Every image in this folder is licensed stock. All files come from Unsplash and are used under the
[Unsplash License](https://unsplash.com/license): free for commercial and non-commercial use, no
permission needed, attribution appreciated but not required. We credit every photographer anyway.

Originals were downloaded from the photo pages below and then resized, cropped and compressed to
WebP. Any other change is listed in the "Changes" column. License plates were blurred for privacy.

## Car photos are illustrative

A car photo shows the **model**, not the tokenized vehicle. The UI must mark it with an
"Illustrative photo" note. A photo is only labeled with a model when its Unsplash page names that
model and the car in the frame visibly matches it.

We have no verified licensed photo for **Chevrolet Cobalt**, **Chevrolet Onix** or **JAC J7**.
Those vehicles use `places/almaty-taxi-mountains.webp`, and the UI must not present that image as
the model.

## Files

| File                                      | Shows                                        | Photographer                                                   | Source                                                                     | Changes                                                                                 |
| ----------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `hero/almaty-night-traffic.webp`          | Night traffic on a wet avenue, Almaty        | [Dmitrii Filatov](https://unsplash.com/@dmitrii_filatov)       | [unsplash.com/photos/mUNZV5ZP658](https://unsplash.com/photos/mUNZV5ZP658) | 2400 px wide; film grain softened (1.8 px blur at source) to fit the 250 KB hero budget |
| `hero/almaty-night-traffic-portrait.webp` | Same photo, portrait crop for mobile         | [Dmitrii Filatov](https://unsplash.com/@dmitrii_filatov)       | [unsplash.com/photos/mUNZV5ZP658](https://unsplash.com/photos/mUNZV5ZP658) | 2:3 crop, 1080 px wide; grain softened                                                  |
| `cars/toyota-camry.webp`                  | Toyota Camry, 8th generation (XV70)          | [Kevin Bonilla](https://unsplash.com/@kevinography)            | [unsplash.com/photos/YPfnvLc3bbQ](https://unsplash.com/photos/YPfnvLc3bbQ) | 4:3 crop, 1200×900; plate blurred                                                       |
| `cars/hyundai-sonata.webp`                | Hyundai Sonata (2024 facelift)               | [Hyundai Motor Group](https://unsplash.com/@hyundaimotorgroup) | [unsplash.com/photos/ZPvrPejfrPU](https://unsplash.com/photos/ZPvrPejfrPU) | 4:3 crop, 1200×900                                                                      |
| `cars/hyundai-elantra.webp`               | Hyundai Elantra, 7th generation              | [Zoshua Colah](https://unsplash.com/@zoshuacolah)              | [unsplash.com/photos/qe9DlyijsMs](https://unsplash.com/photos/qe9DlyijsMs) | 4:3 crop, 1200×900; plate blurred                                                       |
| `cars/hyundai-accent.webp`                | Hyundai Accent sedan (RB generation)         | [Kenejd Spahiu](https://unsplash.com/@kenejd)                  | [unsplash.com/photos/BQm4GbUqncY](https://unsplash.com/photos/BQm4GbUqncY) | 4:3 crop, 1200×900; plate blurred; light softening (1.2 px) to fit 120 KB               |
| `cars/kia-k5.webp`                        | Kia K5 Hybrid                                | [Hyundai Motor Group](https://unsplash.com/@hyundaimotorgroup) | [unsplash.com/photos/2T3cBABJH-E](https://unsplash.com/photos/2T3cBABJH-E) | 4:3 crop, 1200×900                                                                      |
| `cars/kia-rio.webp`                       | Kia Rio sedan, 4th generation                | [Vitali Adutskevich](https://unsplash.com/@vadutskevich)       | [unsplash.com/photos/eymwVWSkoIo](https://unsplash.com/photos/eymwVWSkoIo) | 4:3 crop, 1200×900; plate blurred                                                       |
| `places/almaty-skyline.webp`              | Almaty skyline and the Trans-Ili Alatau      | [Michael Starkie](https://unsplash.com/@starkie_pics)          | [unsplash.com/photos/9pUJBhKPKYU](https://unsplash.com/photos/9pUJBhKPKYU) | 1600 px wide                                                                            |
| `places/almaty-taxi-mountains.webp`       | Almaty taxi at golden hour, mountains behind | [Alina Makhatyrova](https://unsplash.com/@tfcygv79)            | [unsplash.com/photos/eV9LeWpNwpE](https://unsplash.com/photos/eV9LeWpNwpE) | 4:3 crop, 1200×900                                                                      |

## Size budget

Hero ≤ 250 KB, cards ≤ 120 KB, other images ≤ 150 KB. `src/components/catalog/__tests__/vehiclePhoto.test.ts`
checks that every file here is listed in this table and stays within budget.

## Fonts

Fonts are self-hosted and credited separately in `src/fonts/README.md`.
