import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FixtureConnection, fixtureProject } from '@/lib/solana/__tests__/fixtures/chain';
import { AppProviders, testWallet } from '@/__tests__/helpers/providers';
import { makeProject } from '@/components/catalog/__tests__/fixtures';
import type { Project } from '@/types/project';
import { CarPayouts } from '../CarPayouts';

function renderPayouts(connection: FixtureConnection, project: Project) {
  render(
    <AppProviders connection={connection} wallet={testWallet(null)}>
      <CarPayouts project={project} />
    </AppProviders>,
  );
}

describe('CarPayouts', () => {
  it('says there are no payouts yet without reading the chain', () => {
    const connection = new FixtureConnection();
    renderPayouts(connection, makeProject({ periodCount: 0 }));

    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
    expect(connection.scans).toBe(0);
  });

  it('lists every deposit of the car newest first, with what each share received', async () => {
    const connection = new FixtureConnection();
    renderPayouts(connection, await fixtureProject('operating', connection));

    const table = await screen.findByRole('table');
    const [, newest, , oldest] = within(table).getAllByRole('row');
    expect(within(table).getByRole('columnheader', { name: 'Paid in tKZT' })).toBeInTheDocument();
    // 555 555 557 gross, 15% fee, over 100 shares; the program's third period is payout #3.
    expect(within(newest).getByRole('link', { name: /^#3/ })).toHaveAttribute(
      'href',
      expect.stringContaining('explorer'),
    );
    expect(within(newest).getByText('472.22')).toBeInTheDocument();
    expect(within(newest).getByText('4.72')).toBeInTheDocument();
    expect(within(newest).getByText(/^Dec 1\s–\s31, 2026$/)).toBeInTheDocument();
    expect(within(oldest).getByRole('link', { name: /^#1/ })).toBeInTheDocument();
    expect(within(oldest).getByText('1,049.38')).toBeInTheDocument();
  });

  it('offers a retry when the payouts cannot be read', async () => {
    const connection = new FixtureConnection();
    const project = await fixtureProject('operating', connection);
    connection.failingScans = 1;
    renderPayouts(connection, project);

    await screen.findByText("Couldn't read this car's payouts from Solana.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(connection.scans).toBe(2);
  });
});
