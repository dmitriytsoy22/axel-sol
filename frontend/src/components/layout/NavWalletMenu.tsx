'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useWalletInfo } from '@/hooks/useWalletInfo';
import { Link as LinkIcon } from 'lucide-react';

export const NavWalletMenu = (): JSX.Element => {
  const tCommon = useTranslations('Common');
  const { disconnect, connected } = useWallet();
  const { truncatedAddress, balance, publicKey } = useWalletInfo();
  
  const [chipDropdownOpen, setChipDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const chipRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        chipRef.current &&
        !chipRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setChipDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { setVisible } = useWalletModal();

  const handleConnect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setChipDropdownOpen(false);
  }, [disconnect]);

  const handleCopyAddress = useCallback(async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('[AXEL] Failed to copy address');
    }
  }, [publicKey]);


  return (
    <div className="hidden sm:block">
      {connected && truncatedAddress ? (
        <div className="relative" ref={chipRef}>
          <button
            id="wallet-chip"
            onClick={() => setChipDropdownOpen(!chipDropdownOpen)}
            className="bg-surface-secondary px-4 py-1.5 rounded-full flex items-center space-x-2 border border-border-subtle hover:bg-surface-hover transition-colors duration-200 cursor-pointer"
          >
            <span className="font-mono text-[13px] font-medium text-text-primary">
              {truncatedAddress} {balance !== null && `· ${balance.toFixed(2)} SOL`}
            </span>
            <div className="w-2 h-2 rounded-full bg-brand-primary"></div>
          </button>

          {chipDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute right-0 top-full mt-2 w-[280px] bg-white rounded-card-sm shadow-md p-4 animate-slide-down z-dropdown"
              style={{ border: '1px solid #E8E8ED' }}
            >
              <button
                onClick={handleCopyAddress}
                className="w-full text-left flex items-center justify-between gap-2 p-2 rounded-[8px] hover:bg-surface-secondary transition-colors duration-fast cursor-pointer border-none bg-transparent"
              >
                <span className="font-mono text-[13px] text-text-primary break-all leading-snug">
                  {publicKey}
                </span>
                <span className="text-[12px] text-text-secondary whitespace-nowrap flex-shrink-0">
                  {copied ? tCommon('copied') : tCommon('copy')}
                </span>
              </button>

              <div className="h-px bg-border-subtle my-2" />

              <button
                id="wallet-disconnect"
                onClick={handleDisconnect}
                className="w-full text-left p-2 rounded-[8px] text-[14px] text-semantic-error hover:bg-semantic-error-muted transition-colors duration-fast cursor-pointer border-none bg-transparent"
              >
                {tCommon('disconnect')}
              </button>
            </div>
          )}
        </div>
      ) : mounted ? (
        <button
          id="wallet-connect"
          onClick={handleConnect}
          className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-brand-primary-light text-brand-primary-active hover:bg-[#B5F5FC] transition-colors duration-200 font-medium text-[13px] border-none cursor-pointer"
        >
          <LinkIcon size={16} strokeWidth={2} />
          <span>{tCommon('connect')}</span>
        </button>
      ) : (
        <button className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-surface-secondary text-text-secondary font-medium text-[13px] border-none">
          <LinkIcon size={16} strokeWidth={2} />
          <span>{tCommon('connect')}</span>
        </button>
      )}
    </div>
  );
};
