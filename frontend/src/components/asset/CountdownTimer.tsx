import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface CountdownTimerProps {
  deadline: number; // Unix timestamp in seconds
}

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

const secondsLeft = (deadline: number) => Math.max(0, deadline - Math.floor(Date.now() / 1000));

/*
 * Time left as days, hours, minutes and seconds, each with its unit: "44:09:51:17" read like a
 * clock time. The component mounts in the browser after the car is read, so the first frame
 * already shows the real time left instead of flashing the ended state.
 */
export function CountdownTimer({ deadline }: CountdownTimerProps): React.JSX.Element {
  const t = useTranslations('Asset');
  const tCommon = useTranslations('Common');
  const [timeLeft, setTimeLeft] = useState(() => secondsLeft(deadline));

  useEffect(() => {
    const update = () => setTimeLeft(secondsLeft(deadline));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const counts = {
    days: Math.floor(timeLeft / 86400),
    hours: Math.floor((timeLeft % 86400) / 3600),
    minutes: Math.floor((timeLeft % 3600) / 60),
    seconds: timeLeft % 60,
  };
  const label = UNITS.map((unit) => tCommon(`duration_${unit}`, { count: counts[unit] })).join(' ');
  const ended = timeLeft <= 0;
  // Under a day left reads amber, not red: red is kept for errors, and a deadline is not one.
  const isUrgent = !ended && timeLeft < 86400;

  return (
    <span
      role="timer"
      aria-label={label}
      data-testid={ended ? 'timer-ended' : 'timer-active'}
      data-urgent={ended ? undefined : isUrgent}
      className={`inline-flex gap-x-2 whitespace-nowrap text-title font-semibold tabular-nums ${ended ? 'text-muted-foreground' : isUrgent ? 'text-warning' : 'text-foreground'}`}
    >
      {UNITS.map((unit) => (
        <span key={unit}>
          {String(counts[unit]).padStart(2, '0')}
          <span className="ml-0.5 text-small font-medium text-muted-foreground">
            {t(`timerUnit_${unit}`)}
          </span>
        </span>
      ))}
    </span>
  );
}
