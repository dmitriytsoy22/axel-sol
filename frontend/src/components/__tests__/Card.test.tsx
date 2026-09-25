import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from '../ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <div>Inner Content</div>
      </Card>,
    );
    expect(screen.getByText('Inner Content')).toBeInTheDocument();
  });

  it("keeps the caller's classes", () => {
    render(<Card className="test-card-class">Content</Card>);
    expect(screen.getByText('Content')).toHaveClass('test-card-class');
  });
});
