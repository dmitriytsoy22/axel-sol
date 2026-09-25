'use client';

import React, { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { formatTokenAmount } from '@/lib/format';
import { sharesValue } from '@/lib/solana/math';
import type { Project } from '@/types/project';
import { RefundDialog } from './RefundDialog';

interface RefundButtonProps {
  project: Project;
  /** Shares the wallet holds; the refund is exactly their price. */
  shares: bigint;
  onRefunded: () => void;
  className?: string;
}

/** Opens the refund of a failed raise, naming the amount that comes back. */
export function RefundButton({
  project,
  shares,
  onRefunded,
  className,
}: RefundButtonProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const amount = formatTokenAmount(
    sharesValue(shares, project.pricePerShare),
    project.payment,
    locale,
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className={className}>
        {t('refund', { amount })}
      </Button>
      <RefundDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        project={project}
        shares={shares}
        onRefunded={onRefunded}
      />
    </>
  );
}
