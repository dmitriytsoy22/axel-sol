import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import messagesRu from '../../../../messages/ru.json';
import { CountdownTimer } from '../../asset/CountdownTimer';

function renderTimer(deadline: number, locale: 'en' | 'ru' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? messagesEn : messagesRu}>
      <CountdownTimer deadline={deadline} />
    </NextIntlClientProvider>,
  );
}

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows days, hours, minutes and seconds with their units', () => {
    // Current time: Jan 1, 2024, 00:00:00 UTC
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // Deadline: Jan 2, 2024, 12:00:00 UTC (36 hours left)
    const deadline = Math.floor(new Date('2024-01-02T12:00:00Z').getTime() / 1000);

    renderTimer(deadline);

    const element = screen.getByRole('timer', { name: '1 day 12 hours 0 minutes 0 seconds' });
    expect(element).toHaveAttribute('data-testid', 'timer-active');
    expect(element.textContent).toBe('01d12h00m00s');
    expect(element).toHaveAttribute('data-urgent', 'false');
  });

  it("names the units in the reader's language", () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const deadline = Math.floor(new Date('2024-01-03T02:05:07Z').getTime() / 1000);

    renderTimer(deadline, 'ru');

    const element = screen.getByRole('timer', { name: '2 дня 2 часа 5 минут 7 секунд' });
    expect(element.textContent).toBe('02д02ч05мин07с');
  });

  it('marks the timer urgent when less than 24 hours remain', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // Deadline: 2 hours and 5 minutes away
    const deadline = Math.floor(new Date('2024-01-01T02:05:00Z').getTime() / 1000);

    renderTimer(deadline);

    const element = screen.getByTestId('timer-active');
    expect(element.textContent).toBe('00d02h05m00s');
    expect(element).toHaveAttribute('data-urgent', 'true');
  });

  it('shows the time left in its first render, before any effect runs', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const deadline = Math.floor(new Date('2024-01-01T00:00:10Z').getTime() / 1000);

    // Server rendering runs no effects: what it returns is the first frame a reader sees.
    const firstFrame = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messagesEn}>
        <CountdownTimer deadline={deadline} />
      </NextIntlClientProvider>,
    );

    expect(firstFrame).toContain('data-testid="timer-active"');
    expect(firstFrame).not.toContain('timer-ended');
  });

  it('updates every second', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const deadline = Math.floor(new Date('2024-01-01T00:00:10Z').getTime() / 1000); // 10 secs

    renderTimer(deadline);
    expect(screen.getByTestId('timer-active').textContent).toBe('00d00h00m10s');

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('timer-active').textContent).toBe('00d00h00m09s');
  });

  it('shows zeros, muted, when the deadline has passed', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    // Deadline is in the past
    const deadline = Math.floor(new Date('2023-12-31T00:00:00Z').getTime() / 1000);

    renderTimer(deadline);

    const element = screen.getByTestId('timer-ended');
    expect(element.textContent).toBe('00d00h00m00s');
    expect(element).toHaveClass('text-muted-foreground');
  });
});
