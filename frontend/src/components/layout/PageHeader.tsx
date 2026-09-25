import React, { ReactNode } from 'react';

interface PageHeaderProps {
  overline: string;
  title: string;
  lead?: ReactNode;
  /** Page-level actions or meta, shown to the right from md. */
  children?: ReactNode;
}

/** The opening of a working screen: overline, serif H1 and one lead line. */
export function PageHeader({ overline, title, lead, children }: PageHeaderProps): JSX.Element {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-[65ch]">
        <p className="text-overline uppercase text-muted-foreground">{overline}</p>
        <h1 className="mt-3 font-heading text-h2 font-medium text-foreground md:text-h1">
          {title}
        </h1>
        {lead && <p className="mt-4 text-lead text-muted-foreground">{lead}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </header>
  );
}
