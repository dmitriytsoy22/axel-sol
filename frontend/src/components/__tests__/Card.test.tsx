import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from '../ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <div>Inner Content</div>
      </Card>
    );
    expect(screen.getByText('Inner Content')).toBeInTheDocument();
  });

  it('applies default classes and custom classes', () => {
    const { container } = render(
      <Card className="test-card-class">Content</Card>
    );
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain('bg-white');
    expect(div.className).toContain('rounded-2xl');
    expect(div.className).toContain('test-card-class');
  });
});
