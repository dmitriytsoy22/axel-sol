import React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { Project } from '@/types/project';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Link } from '@/i18n/routing';
import { formatNumber, formatPercent, formatTokenAmount } from '@/lib/format';
import { sharesValue } from '@/lib/solana/math';
import { carTitle } from '@/lib/solana/tokens';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { vehiclePhoto } from './vehiclePhoto';

interface AssetCardProps {
  project: Project;
}

export function AssetCard({ project }: AssetCardProps): JSX.Element {
  const t = useTranslations('Catalog');
  const locale = useLocale();
  const { car, payment } = project;

  const sold = Number(project.sharesSold);
  const total = Number(project.totalShares);
  const progress = total > 0 ? (sold / total) * 100 : 0;
  const title = carTitle(car);
  const photo = vehiclePhoto(car.make, car.model);

  return (
    <Link
      href={`/assets/${project.shareMint.toBase58()}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground no-underline shadow-sm transition-shadow duration-base ease-move hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <Image
          src={photo.src}
          alt={photo.showsModel ? title : ''}
          fill
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <ProjectStatusBadge status={project.status} className="absolute left-3 top-3" />
        {/* Share mints carry no photo of the car itself, so every photo is of the model. */}
        <span className="absolute bottom-3 left-3 rounded-control bg-ink-950/70 px-2 py-0.5 text-small text-ink-25">
          {t('illustrativePhoto')}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-title font-semibold text-foreground">{title}</h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-small text-muted-foreground">
          {car.year !== null && <span className="tabular-nums">{car.year}</span>}
          {car.city && (
            <>
              <span aria-hidden="true">·</span>
              <span>{car.city}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono">{car.symbol}</span>
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-4">
          <div className="flex flex-col-reverse justify-end gap-1">
            <dt className="text-small text-muted-foreground">{t('pricePerToken')}</dt>
            <dd className="whitespace-nowrap text-title font-semibold tabular-nums text-foreground">
              {formatTokenAmount(project.pricePerShare, payment, locale)}
            </dd>
          </div>
          <div className="flex flex-col-reverse justify-end gap-1">
            <dt className="text-small text-muted-foreground">{t('payoutPeriods')}</dt>
            <dd className="text-title font-semibold tabular-nums text-foreground">
              {formatNumber(project.periodCount, locale)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-small">
            <span className="text-muted-foreground">
              {t('percentSold', { percent: formatPercent(sold, total, locale) })}
            </span>
            <span className="whitespace-nowrap font-medium tabular-nums text-foreground">
              {t('raisedOf', {
                raised: formatTokenAmount(
                  sharesValue(project.sharesSold, project.pricePerShare),
                  payment,
                  locale,
                  0,
                ),
                goal: formatTokenAmount(
                  sharesValue(project.totalShares, project.pricePerShare),
                  payment,
                  locale,
                  0,
                ),
              })}
            </span>
          </div>
          <ProgressBar progress={progress} label={t('raised')} />
        </div>

        <span className="mt-auto flex items-center gap-1 pt-6 text-small font-medium text-primary">
          {project.status === 'fundraising' ? t('investBtn') : t('viewBtn')}
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-fast ease-move group-hover:translate-x-0.5"
            strokeWidth={1.75}
          />
        </span>
      </div>
    </Link>
  );
}
