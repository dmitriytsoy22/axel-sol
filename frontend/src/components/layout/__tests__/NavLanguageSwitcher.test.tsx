import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messagesEn from '../../../../messages/en.json';
import { NavLanguageSwitcher } from '../NavLanguageSwitcher';

const replace = vi.fn();

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/solvency',
  useRouter: () => ({ replace }),
}));

function renderSwitcher() {
  render(
    <NextIntlClientProvider locale="en" messages={messagesEn}>
      <NavLanguageSwitcher />
      <button type="button">Connect wallet</button>
    </NextIntlClientProvider>,
  );
  return screen.getByRole('button', { name: 'Language: English' });
}

afterEach(() => {
  replace.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('NavLanguageSwitcher', () => {
  it('closes the list when Tab moves focus past its last language', async () => {
    const toggle = renderSwitcher();
    await userEvent.click(toggle);
    expect(screen.getByRole('list')).toBeInTheDocument();

    for (let i = 0; i < 4; i++) await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Connect wallet' })).toHaveFocus();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('keeps the list open while Tab moves between its languages', async () => {
    const toggle = renderSwitcher();
    await userEvent.click(toggle);

    await userEvent.tab();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Русский' })).toHaveFocus();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('gives focus back to the toggle when Escape closes the list from a language', async () => {
    const toggle = renderSwitcher();
    await userEvent.click(toggle);
    await userEvent.tab();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('opens the same page and #section in the chosen language without scrolling to the top', async () => {
    window.history.replaceState(null, '', '/solvency#how-it-works');
    const toggle = renderSwitcher();
    await userEvent.click(toggle);

    await userEvent.click(screen.getByRole('button', { name: 'Русский' }));

    expect(replace).toHaveBeenCalledWith('/solvency#how-it-works', { locale: 'ru', scroll: false });
  });
});
