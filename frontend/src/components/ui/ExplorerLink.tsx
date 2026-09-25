import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { getExplorerUrl } from '@/lib/solana/connection';
import { shortAddress } from '@/lib/format';

interface ExplorerLinkProps {
  address: string;
  /** Screen-reader text for the destination, e.g. "Open in Solana Explorer". */
  srLabel: string;
  className?: string;
}

/* A shortened account address that opens the account in Solana Explorer on the app's cluster. */
export function ExplorerLink({ address, srLabel, className = '' }: ExplorerLinkProps): JSX.Element {
  return (
    <a
      href={getExplorerUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className={`inline-flex min-h-11 items-center gap-1 font-mono md:min-h-0 text-small text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline ${className}`}
    >
      {shortAddress(address)}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="sr-only">{srLabel}</span>
    </a>
  );
}
