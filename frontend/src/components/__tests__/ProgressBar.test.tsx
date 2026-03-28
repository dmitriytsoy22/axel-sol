import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../ui/ProgressBar';

describe('ProgressBar', () => {
  it('renders correctly with given progress', () => {
    render(<ProgressBar progress={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveStyle('width: 50%');
  });

  it('clamps progress to 100 maximum', () => {
    render(<ProgressBar progress={150} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle('width: 100%');
  });

  it('clamps progress to 0 minimum', () => {
    render(<ProgressBar progress={-20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveStyle('width: 0%');
  });

  it('applies custom className', () => {
    const { container } = render(<ProgressBar progress={10} className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
