import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import { StateTimeline } from '../StateTimeline';

const DAY = 86_400;
// 12:00 UTC on Oct 1, 2026: the same calendar day in every time zone the tests run in.
const OCT_1 = 1_790_856_000;

function renderClosedCar(activatedAt: number, closedAt: number) {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <StateTimeline
        project={makeProject({
          status: 'closed',
          createdAt: OCT_1 - 20 * DAY,
          activationDeadline: OCT_1 + 3 * DAY,
          activatedAt,
          closedAt,
        })}
        saleState="ended"
      />
    </NextIntlClientProvider>,
  );
  return screen.getByText('On the road').closest('li')!;
}

describe('StateTimeline', () => {
  it('writes the time on the road of a car closed on the day it started as that one date', () => {
    const onTheRoad = renderClosedCar(OCT_1, OCT_1 + 3_600);

    expect(within(onTheRoad).getByText('Oct 1, 2026')).toBeInTheDocument();
    expect(within(onTheRoad).queryByText(/–/)).not.toBeInTheDocument();
  });

  it('writes the time on the road of a car closed on a later day as a range', () => {
    const onTheRoad = renderClosedCar(OCT_1, OCT_1 + 40 * DAY);

    const range = within(onTheRoad).getByText(/^Oct 1, 2026\s–\sNov 10, 2026$/);
    // The dash keeps to the date before it, so the range never opens a line with it.
    expect(range.textContent).toContain('2026\u00a0–');
  });
});
