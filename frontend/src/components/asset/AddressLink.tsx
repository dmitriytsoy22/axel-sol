import { ExternalLink } from 'lucide-react';
import React from 'react';

interface AddressLinkProps {
  address: string;
  className?: string;
}

export function AddressLink({ address, className = '' }: AddressLinkProps): React.JSX.Element {
  const truncated = `${address.slice(0, 4)}...${address.slice(-4)}`;
  // Using Explorer URL for Devnet as this is Web3
  const explorerUrl = `https://explorer.solana.com/address/${address}?cluster=devnet`;

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-cyan-600 hover:text-cyan-700 transition-colors text-sm font-medium ${className}`}
      title={address}
    >
      {truncated}
      <ExternalLink size={14} />
    </a>
  );
}
