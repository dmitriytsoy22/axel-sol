import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';
import messagesEn from '../../../messages/en.json';
import { makeCar, makeProject } from '@/components/catalog/__tests__/fixtures';
import type { Project } from '@/types/project';
import { AssetCard } from '../catalog/AssetCard';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

function renderCard(project: Project) {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <AssetCard project={project} />
    </NextIntlClientProvider>,
  );
}

describe('AssetCard', () => {
  it('shows the price, the raise and the payouts in the payment token', () => {
    const project = makeProject({
      sharesSold: 50n,
      totalShares: 100n,
      pricePerShare: 10_000_000_000n,
      periodCount: 3,
    });
    renderCard(project);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Toyota Camry');
    expect(screen.getByText('10,000 tKZT')).toBeInTheDocument();
    expect(screen.getByText('500,000 tKZT of 1,000,000 tKZT')).toBeInTheDocument();
    expect(screen.getByText('50% sold')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveStyle('width: 50%');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('links to the car by its share mint and invites a purchase while the raise runs', () => {
    const project = makeProject({ status: 'fundraising' });
    renderCard(project);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `/assets/${project.shareMint.toBase58()}`,
    );
    expect(screen.getByText('Raising')).toBeInTheDocument();
    expect(screen.getByText('Buy shares')).toBeInTheDocument();
  });

  it('offers a look, not a purchase, once the car is on the road', () => {
    renderCard(makeProject({ status: 'operating' }));

    expect(screen.getByText('On the road')).toBeInTheDocument();
    expect(screen.getByText('View car')).toBeInTheDocument();
  });

  it('shows the stock photo of the model and marks it as illustrative', () => {
    renderCard(makeProject({ car: makeCar({ make: 'Toyota', model: 'Camry' }) }));

    expect(screen.getByRole('img', { name: 'Toyota Camry' })).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('/images/cars/toyota-camry.webp')),
    );
    expect(screen.getByText('Illustrative photo')).toBeInTheDocument();
  });

  it('does not present the Almaty fallback image as the model', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messagesEn}>
        <AssetCard
          project={makeProject({ car: makeCar({ make: 'Chevrolet', model: 'Cobalt' }) })}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole('img', { name: /Chevrolet Cobalt/ })).not.toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('/images/places/almaty-taxi-mountains.webp')),
    );
  });
});
