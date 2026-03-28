import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownTimer } from '../../asset/CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly with more than 24 hours remaining', () => {
    // Current time: Jan 1, 2024, 00:00:00 UTC
    const mockDate = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(mockDate);
    
    // Deadline: Jan 2, 2024, 12:00:00 UTC (36 hours left)
    const deadline = Math.floor(new Date('2024-01-02T12:00:00Z').getTime() / 1000);
    
    render(<CountdownTimer deadline={deadline} />);

    // 36 hours = 01:12:00:00 (DD:HH:MM:SS)
    const element = screen.getByTestId('timer-active');
    expect(element).toBeInTheDocument();
    expect(element.textContent).toBe('01:12:00:00');
    expect(element.className).toContain('text-gray-900'); // not urgent
  });

  it('renders correctly in red when less than 24 hours remain', () => {
    const mockDate = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(mockDate);
    
    // Deadline: 2 hours and 5 minutes away
    const deadline = Math.floor(new Date('2024-01-01T02:05:00Z').getTime() / 1000);
    
    render(<CountdownTimer deadline={deadline} />);

    const element = screen.getByTestId('timer-active');
    expect(element.textContent).toBe('00:02:05:00');
    expect(element.className).toContain('text-[#FF3B30]'); // urgent
  });

  it('updates every second', () => {
    const mockDate = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(mockDate);
    
    const deadline = Math.floor(new Date('2024-01-01T00:00:10Z').getTime() / 1000); // 10 secs
    
    render(<CountdownTimer deadline={deadline} />);
    expect(screen.getByTestId('timer-active').textContent).toBe('00:00:00:10');

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('timer-active').textContent).toBe('00:00:00:09');
  });

  it('displays 00:00:00:00 when deadline has passed', () => {
    const mockDate = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(mockDate);
    
    // Deadline is in the past
    const deadline = Math.floor(new Date('2023-12-31T00:00:00Z').getTime() / 1000);
    
    render(<CountdownTimer deadline={deadline} />);
    
    const element = screen.getByTestId('timer-ended');
    expect(element).toBeInTheDocument();
  });
});
