import type { Page } from '@playwright/test';
import { URLS } from './stack/config';
import { expect, test } from './support/fixtures';

/*
 * The stack binds `next dev` to 127.0.0.1, the address the browser opens. Next 14 showed the
 * locale middleware such a request as http://localhost, and every English page redirected to
 * itself there until next.config.mjs turned that normalization off.
 */

const SOLVENCY_TITLE = {
  en: 'Every token where the program says it is',
  ru: 'Каждый токен там, где его показывает программа',
} as const;

type Locale = keyof typeof SOLVENCY_TITLE;

async function expectSolvencyPage(page: Page, path: string, locale: Locale): Promise<void> {
  await expect(page).toHaveURL(`${URLS.frontend}${path}`);
  // The document's language has no role to find it by.
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.getByRole('heading', { level: 1, name: SOLVENCY_TITLE[locale] })).toBeVisible();
}

const addresses: { opened: string; shown: string; locale: Locale }[] = [
  { opened: '/solvency', shown: '/solvency', locale: 'en' },
  { opened: '/en/solvency', shown: '/solvency', locale: 'en' },
  { opened: '/ru/solvency', shown: '/ru/solvency', locale: 'ru' },
];

for (const { opened, shown, locale } of addresses) {
  test(`${opened} shows the ${locale} page at ${shown} on the address the browser opened`, async ({
    page,
  }) => {
    await page.goto(opened);

    await expectSolvencyPage(page, shown, locale);
  });
}

test('switching the language keeps the reader on the address they opened', async ({ page }) => {
  await page.goto('/solvency');
  const header = page.getByRole('banner');

  await header.getByRole('button', { name: 'Language: English' }).click();
  await header.getByRole('button', { name: 'Русский' }).click();
  await expectSolvencyPage(page, '/ru/solvency', 'ru');

  await header.getByRole('button', { name: 'Язык: Русский' }).click();
  await header.getByRole('button', { name: 'English' }).click();
  await expectSolvencyPage(page, '/solvency', 'en');
});
