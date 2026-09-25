import React, { useEffect, useState } from 'react';

interface CountdownTimerProps {
  deadline: number; // Unix timestamp in seconds
}

export function CountdownTimer({ deadline }: CountdownTimerProps): React.JSX.Element {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    // Determine the difference initially and set up interval
    const updateTime = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = Math.max(0, deadline - now);
      setTimeLeft(diff);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  // If deadline passed
  if (timeLeft <= 0) {
    return (
      <span data-testid="timer-ended" className="text-title font-semibold tabular-nums text-muted-foreground">
        00:00:00:00
      </span>
    );
  }

  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Under a day left reads amber, not red: red is kept for errors, and a deadline is not one.
  const isUrgent = timeLeft < 86400;

  return (
    <span
      data-testid="timer-active"
      data-urgent={isUrgent}
      className={`text-title font-semibold tabular-nums ${isUrgent ? 'text-warning' : 'text-foreground'}`}
    >
      {pad(days)}:{pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}
