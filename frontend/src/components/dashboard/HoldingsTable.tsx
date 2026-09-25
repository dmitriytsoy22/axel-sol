import React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ProjectStatusBadge } from '@/components/catalog/ProjectStatusBadge';
import { vehiclePhoto } from '@/components/catalog/vehiclePhoto';
import { Notice } from '@/components/ui/Notice';
import { Button, buttonClasses } from '@/components/ui/Button';
import type { Holding } from '@/hooks/usePositions';
import { Link } from '@/i18n/routing';
import { formatCount, formatPercent, formatTokenAmount } from '@/lib/format';
import { canClaim, canRefund, canTransfer } from '@/lib/solana/lifecycle';
import { sharesValue } from '@/lib/solana/math';
import { carTitle } from '@/lib/solana/tokens';
import { ClaimButton } from './ClaimButton';
import { RefundButton } from './RefundButton';

interface HoldingsTableProps {
  holdings: Holding[];
  /** Runs after a claim or refund, to read the positions again. */
  onChanged: () => void;
  onTransfer: (holding: Holding) => void;
}

function CarThumb({ holding }: { holding: Holding }): JSX.Element {
  const { car } = holding.project;
  return (
    <span className="relative h-9 w-12 shrink-0 overflow-hidden rounded-control bg-muted">
      <Image
        src={vehiclePhoto(car.make, car.model).src}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
      />
    </span>
  );
}

/** What a holder can do with one car right now: claim, get a refund, or send shares. */
function Actions({
  holding,
  onChanged,
  onTransfer,
}: { holding: Holding } & Omit<HoldingsTableProps, 'holdings'>) {
  const t = useTranslations('Dashboard');
  const { project, position, pending } = holding;
  return (
    <span className="flex flex-wrap justify-end gap-2">
      {pending > 0n && canClaim(project.status) && (
        <ClaimButton project={project} onClaimed={onChanged} />
      )}
      {position.shares > 0n && canRefund(project.status) && (
        <RefundButton project={project} shares={position.shares} onRefunded={onChanged} />
      )}
      {position.shares > 0n && canTransfer(project.status) && (
        <Button variant="ghost" size="sm" onClick={() => onTransfer(holding)}>
          {t('transfer')}
        </Button>
      )}
    </span>
  );
}

export function HoldingsTable({
  holdings,
  onChanged,
  onTransfer,
}: HoldingsTableProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const locale = useLocale();

  if (holdings.length === 0) {
    return (
      <div data-testid="empty-holdings">
        <Notice
          as="h2"
          title={t('noInvestments')}
          body={t('noInvestmentsDesc')}
          action={
            <Link href="/#vehicles" className={buttonClasses()}>
              {t('exploreCatalog')}
            </Link>
          }
        />
      </div>
    );
  }

  const rows = holdings.map((holding) => {
    const { project, position, pending } = holding;
    return {
      holding,
      key: project.address.toBase58(),
      href: `/assets/${project.shareMint.toBase58()}`,
      name: carTitle(project.car),
      detail: [project.car.year, project.car.symbol].filter(Boolean).join(' · '),
      shares: formatCount(position.shares, locale),
      part: t('ofCar', {
        percent: formatPercent(Number(position.shares), Number(project.totalShares), locale),
      }),
      value: formatTokenAmount(
        sharesValue(position.shares, project.pricePerShare),
        project.payment,
        locale,
      ),
      pending: formatTokenAmount(pending, project.payment, locale),
    };
  });

  return (
    <section aria-labelledby="holdings-title" data-testid="holdings-table">
      <h2 id="holdings-title" className="text-h4 font-semibold text-foreground">
        {t('holdings')}
      </h2>

      <div className="mt-6 overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <table className="hidden w-full text-left text-small md:table">
          <thead className="border-b border-border bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="py-3 pl-6 pr-4 font-medium">
                {t('asset')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('tokens')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('value')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('toClaim')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('status')}
              </th>
              <th scope="col" className="py-3 pl-4 pr-6 text-right font-medium">
                <span className="sr-only">{t('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-3 pl-6 pr-4">
                  <Link
                    href={row.href}
                    className="group inline-flex items-center gap-3 text-foreground"
                  >
                    <CarThumb holding={row.holding} />
                    <span>
                      <span className="block font-medium underline-offset-4 group-hover:underline">
                        {row.name}
                      </span>
                      <span className="block font-mono tabular-nums text-muted-foreground">
                        {row.detail}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="block font-medium text-foreground">{row.shares}</span>
                  <span className="block text-muted-foreground">{row.part}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                  {row.value}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                  {row.pending}
                </td>
                <td className="px-4 py-3">
                  <ProjectStatusBadge status={row.holding.project.status} />
                </td>
                <td className="py-3 pl-4 pr-6">
                  <Actions holding={row.holding} onChanged={onChanged} onTransfer={onTransfer} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border md:hidden">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 px-5 py-4">
              <Link href={row.href} className="flex items-center gap-3 text-foreground">
                <CarThumb holding={row.holding} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.name}</span>
                  <span className="block font-mono text-small text-muted-foreground">
                    {row.detail}
                  </span>
                </span>
                <ProjectStatusBadge status={row.holding.project.status} />
              </Link>
              <dl className="grid grid-cols-3 gap-2 text-small tabular-nums">
                <div>
                  <dt className="text-muted-foreground">{t('tokens')}</dt>
                  <dd className="font-medium text-foreground">{row.shares}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('value')}</dt>
                  <dd className="font-medium text-foreground">{row.value}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('toClaim')}</dt>
                  <dd className="font-medium text-foreground">{row.pending}</dd>
                </div>
              </dl>
              <Actions holding={row.holding} onChanged={onChanged} onTransfer={onTransfer} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
