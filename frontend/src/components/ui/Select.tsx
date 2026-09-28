import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A native select that looks the same in every engine: Safari drew its own ⌃⌄ indicator with
 * tighter padding, so the control differed between Chrome and the founder's WKWebView. The
 * browser's arrow is removed and one chevron is drawn over the right padding; the option list
 * stays native. As wide as its longest option, and never wider than its row.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ children, ...rest }, ref) => (
  <span className="relative inline-flex min-w-0 max-w-full">
    <select
      ref={ref}
      className="h-11 min-w-0 max-w-full cursor-pointer appearance-none rounded-control border border-input bg-card pl-3 pr-8 text-body text-foreground transition-colors duration-fast ease-move focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 motion-reduce:transition-none md:h-10 md:text-small"
      {...rest}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      strokeWidth={1.75}
    />
  </span>
));

Select.displayName = 'Select';
