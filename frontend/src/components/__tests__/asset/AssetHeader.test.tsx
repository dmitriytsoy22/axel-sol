import React from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import { makeCar, makeProject } from '@/components/catalog/__tests__/fixtures';
import { AssetHeader } from '../../asset/AssetHeader';

describe('AssetHeader', () => {
  it('names the car, its state and where it works from the share mint metadata', () => {
    const car = makeCar({
      make: 'Kia',
      model: 'Rio',
      year: '2024',
      city: 'Almaty',
      class: 'economy',
    });
    render(
      <NextIntlClientProvider locale="en" messages={messagesEn}>
        <AssetHeader project={makeProject({ car, status: 'operating' })} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kia Rio 2024');
    expect(screen.getByText('On the road')).toBeInTheDocument();
    expect(screen.getByText(car.symbol)).toBeInTheDocument();
    expect(screen.getByText('Almaty')).toBeInTheDocument();
    expect(screen.getByText('economy')).toBeInTheDocument();
  });
});
