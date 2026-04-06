import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../ui/Badge';

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge status="active">Test Badge</Badge>);
    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('renders pulsing dot for active status', () => {
    const { container } = render(<Badge status="active">Active</Badge>);
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
  });

  it('does not render pulsing dot for closed status', () => {
    const { container } = render(<Badge status="closed">Closed</Badge>);
    expect(container.querySelector('.animate-ping')).not.toBeInTheDocument();
  });
});
