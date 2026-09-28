import React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import type { Project } from '@/types/project';
import { RaiseProgress } from '@/components/asset/RaiseProgress';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Link } from '@/i18n/routing';
import { formatDate, formatNumber, formatPercent, formatTokenAmount } from '@/lib/format';
import { holdsEscrow } from '@/lib/solana/solvency';
import { sharesValue } from '@/lib/solana/math';
import { carTitle } from '@/lib/solana/tokens';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { useCarLabels } from './useCarLabels';
import { vehiclePhoto } from './vehiclePhoto';

interface AssetCardProps {
  project: Project;
}

export function AssetCard({ project }: AssetCardProps): JSX.Element {
  const t = useTranslations('Catalog');
  const locale = useLocale();
  const { car, payment } = project;
  const labels = useCarLabels();

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
        {/* Share mints carry no photo of the car itself: the photo is of the model, or of an
            Almaty street when no licensed photo of the model exists. */}
        <span className="absolute bottom-3 left-3 rounded-control bg-ink-950/70 px-2 py-0.5 text-small text-ink-25">
          {t(photo.showsModel ? 'illustrativePhoto' : 'streetPhoto')}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-title font-semibold text-foreground">{title}</h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-small text-muted-foreground">
          {car.year !== null && <span className="tabular-nums">{car.year}</span>}
          {car.city && (
            <>
              <span aria-hidden="true">·</span>
              <span>{labels.city(car.city)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono">{car.symbol}</span>
        </p>

        {/* Half a card is 110 px at 320 px and 124 px beside the fleet's heading at 1024 px,
            less than "12 нояб. 2026 г." needs at this size, so a figure wraps between words, in
            balanced lines, rather than run into its neighbour or out of the card. */}
        <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
            <dt className="text-small text-muted-foreground">{t('pricePerToken')}</dt>
            <dd className="text-balance break-words text-title font-semibold tabular-nums text-foreground">
              {formatTokenAmount(project.pricePerShare, payment, locale)}
            </dd>
          </div>
          {project.status === 'fundraising' ? (
            <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
              <dt className="text-small text-muted-foreground">{t('raiseCloses')}</dt>
              <dd className="text-balance break-words text-title font-semibold tabular-nums text-foreground">
                {formatDate(project.raiseDeadline, locale)}
              </dd>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
              <dt className="text-small text-muted-foreground">{t('payoutPeriods')}</dt>
              <dd className="text-title font-semibold tabular-nums text-foreground">
                {formatNumber(project.periodCount, locale)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-small">
            <span className="text-muted-foreground">
              {t('percentSold', { percent: formatPercent(sold, total, locale) })}
            </span>
            <span className="text-right font-medium tabular-nums text-foreground">
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
          {/* While the raise decides the car's fate, the bar shows where it succeeds. */}
          {holdsEscrow(project.status) ? (
            <RaiseProgress project={project} size="sm" />
          ) : (
            <ProgressBar progress={progress} label={t('raised')} />
          )}
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
