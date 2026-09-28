import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface TrailingIconProps {
  children: string;
  icon: LucideIcon;
}

/**
 * A label and the icon after it as one run of text, for a link laid out as a flex row. As two
 * flex items, a label that wrapped took the row's whole width and left the icon at its far
 * edge, between the lines; here the icon stays glued to the label's last word.
 */
export function TrailingIcon({ children: label, icon: Icon }: TrailingIconProps): JSX.Element {
  const lastWord = label.lastIndexOf(' ') + 1;
  return (
    <span>
      {label.slice(0, lastWord)}
      <span className="whitespace-nowrap">
        {label.slice(lastWord)}
        <Icon
          aria-hidden="true"
          className="ml-1 inline h-4 w-4 align-[-0.1875em]"
          strokeWidth={1.75}
        />
      </span>
    </span>
  );
}
