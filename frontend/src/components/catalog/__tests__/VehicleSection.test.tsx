import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import type { ProjectState } from '@/types/project';
import { VehicleSection } from '../VehicleSection';
import { makeProject } from './fixtures';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderSection(feed: Partial<React.ComponentProps<typeof VehicleSection>> = {}) {
  const onRetry = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <VehicleSection projects={[]} isLoading={false} error={null} onRetry={onRetry} {...feed} />
    </NextIntlClientProvider>,
  );
  return { onRetry };
}

const carTitles = (): string[] =>
  screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent ?? '');

describe('VehicleSection', () => {
  it('shows one card per car read from the chain', () => {
    renderSection({
      projects: [
        makeProject({ carModel: 'Camry' }),
        makeProject({ carMake: 'Kia', carModel: 'K5' }),
      ],
    });

    expect(carTitles()).toEqual(['Toyota Camry', 'Kia K5']);
  });

  it('hides the status filter while every car has the same status', () => {
    renderSection({ projects: [makeProject(), makeProject()] });

    expect(screen.queryByRole('group', { name: 'Filter by status' })).not.toBeInTheDocument();
  });

  it('filters the cars by status once their statuses differ', async () => {
    const user = userEvent.setup();
    renderSection({
      projects: [
        makeProject({ carModel: 'Camry', status: 'active' }),
        makeProject({ carMake: 'Hyundai', carModel: 'Sonata', status: 'closed' }),
      ],
    });

    const filter = screen.getByRole('group', { name: 'Filter by status' });
    await user.click(within(filter).getByRole('button', { name: /Closed/ }));

    expect(within(filter).getByRole('button', { name: /Closed/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(carTitles()).toEqual(['Hyundai Sonata']);
  });

  it('shows placeholders, not cards, while the chain is being read', () => {
    renderSection({ isLoading: true });

    expect(carTitles()).toEqual([]);
    expect(screen.queryByText('No cars listed yet')).not.toBeInTheDocument();
  });

  it('says so when no car is listed', () => {
    renderSection({ projects: [] as ProjectState[] });

    expect(screen.getByText('No cars listed yet')).toBeInTheDocument();
  });

  it('offers a retry when the chain cannot be read', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderSection({ error: new Error('429 Too Many Requests') });

    expect(screen.getByText("Couldn't load the cars")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
