import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { getExplorerUrl } from '@/lib/solana/connection';
import { shortAddress } from '@/lib/format';

interface ExplorerLinkProps {
  address: string;
  /** Screen-reader text for the destination, e.g. "Open in Solana Explorer". */
  srLabel: string;
  /**
   * Inside a sentence: the 44 px target below lg overlaps the lines around it, as the demo
   * banner's links do, instead of opening a blank band between them.
   */
  inText?: boolean;
  className?: string;
}

/*
 * A shortened account address that opens the account in Solana Explorer on the app's cluster.
 * It never breaks at its ellipsis: "2B99…" and "v9Ux" on two lines read as two addresses.
 */
export function ExplorerLink({
  address,
  srLabel,
  inText = false,
  className = '',
}: ExplorerLinkProps): JSX.Element {
  return (
    <a
      href={getExplorerUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className={`inline-flex min-h-11 items-center gap-1 whitespace-nowrap font-mono lg:min-h-0 text-small text-primary underline-offset-4 transition-colors duration-fast ease-move hover:text-primary-hover hover:underline ${inText ? '-my-3 lg:my-0' : ''} ${className}`}
    >
      {shortAddress(address)}
      <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="sr-only">{srLabel}</span>
    </a>
  );
}
