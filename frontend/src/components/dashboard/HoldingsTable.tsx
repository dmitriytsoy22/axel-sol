import React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { buttonClasses } from '@/components/ui/Button';
import { Holding } from '@/hooks/useDashboard';
import { vehiclePhoto } from '@/components/catalog/vehiclePhoto';
import { Link } from '@/i18n/routing';
import { ProjectState } from '@/types/project';
import { formatNumber, formatPercent, formatSol } from '@/lib/format';

interface HoldingsTableProps {
  holdings: Holding[];
}

function CarThumb({ project }: { project: ProjectState }): JSX.Element {
  return (
    <span
      className="relative h-9 w-12 shrink-0 overflow-hidden rounded-control bg-muted"
    >
      <Image
        src={project.imageUrl || vehiclePhoto(project.carMake, project.carModel).src}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
      />
    </span>
  );
}

export function HoldingsTable({ holdings }: HoldingsTableProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const tCat = useTranslations('Catalog');
  const locale = useLocale();

  const statusLabel: Record<ProjectState['status'], string> = {
    active: tCat('statusActive'),
    paused: tCat('statusPaused'),
    closed: tCat('statusClosed'),
  };

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

  const rows = holdings.map((holding) => ({
    holding,
    name: `${holding.project.carMake} ${holding.project.carModel}`,
    value: formatSol(holding.tokenBalance * holding.project.pricePerToken, locale),
    shares: formatNumber(holding.tokenBalance, locale),
    part: t('ofCar', {
      percent: formatPercent(holding.tokenBalance, holding.project.totalTokenSupply, locale),
    }),
  }));

  return (
    <section aria-labelledby="holdings-title" data-testid="holdings-table">
      <h2 id="holdings-title" className="text-h4 font-semibold text-foreground">
        {t('holdings')}
      </h2>

      <div className="mt-6 overflow-hidden rounded-card border border-border bg-card shadow-sm">
        <table className="hidden w-full text-left text-small sm:table">
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
              <th scope="col" className="py-3 pl-4 pr-6 font-medium">
                {t('status')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ holding, name, value, shares, part }) => (
              <tr key={holding.project.mint}>
                <td className="py-3 pl-6 pr-4">
                  <Link
                    href={`/assets/${holding.project.mint}`}
                    className="group inline-flex items-center gap-3 text-foreground"
                  >
                    <CarThumb project={holding.project} />
                    <span>
                      <span className="block font-medium underline-offset-4 group-hover:underline">
                        {name}
                      </span>
                      <span className="block tabular-nums text-muted-foreground">
                        {holding.project.carYear} ·{' '}
                        <span className="font-mono">VIN …{holding.project.vin.slice(-4)}</span>
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="block font-medium text-foreground">{shares}</span>
                  <span className="block text-muted-foreground">{part}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                  {value}
                </td>
                <td className="py-3 pl-4 pr-6">
                  <Badge status={holding.project.status}>
                    {statusLabel[holding.project.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border sm:hidden">
          {rows.map(({ holding, name, value, shares, part }) => (
            <li key={holding.project.mint}>
              <Link
                href={`/assets/${holding.project.mint}`}
                className="flex items-center gap-3 px-5 py-4 text-foreground"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="mt-0.5 block text-small tabular-nums text-muted-foreground">
                    {shares} · {part}
                  </span>
                  <span className="block font-mono text-small text-muted-foreground">
                    VIN …{holding.project.vin.slice(-4)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="font-semibold tabular-nums">{value}</span>
                  <Badge status={holding.project.status}>{statusLabel[holding.project.status]}</Badge>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
