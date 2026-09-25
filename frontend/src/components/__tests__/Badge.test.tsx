import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../ui/Badge';

describe('Badge', () => {
  it.each(['active', 'paused', 'closed'] as const)(
    'names the %s status in text and keeps its color dot out of the accessibility tree',
    (status) => {
      const { container } = render(<Badge status={status}>{`Status ${status}`}</Badge>);

      expect(screen.getByText(`Status ${status}`)).toBeVisible();
      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    },
  );
});
