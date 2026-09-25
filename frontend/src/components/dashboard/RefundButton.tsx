'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useRefund } from '@/hooks/useRefund';
import { Button } from '@/components/ui/Button';
import { formatTokenAmount } from '@/lib/format';
import { sharesValue } from '@/lib/solana/math';
import type { Project } from '@/types/project';

interface RefundButtonProps {
  project: Project;
  /** Shares the wallet holds; the refund is exactly their price. */
  shares: bigint;
  onRefunded: () => void;
  className?: string;
}

/** Takes back the full price of the wallet's shares in a failed raise. */
export function RefundButton({
  project,
  shares,
  onRefunded,
  className,
}: RefundButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const { status, refund } = useRefund();
  const busy = status !== 'idle' && status !== 'success' && status !== 'error';
  const amount = formatTokenAmount(
    sharesValue(shares, project.pricePerShare),
    project.payment,
    locale,
  );

  const handleClick = async () => {
    if (await refund(project)) onRefunded();
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleClick}
      disabled={busy}
      className={className}
    >
      {busy && <Loader2 aria-hidden="true" className="animate-spin" strokeWidth={1.75} />}
      {busy ? t('refunding') : t('refund', { amount })}
    </Button>
  );
}
