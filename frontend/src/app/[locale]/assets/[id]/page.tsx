'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RotateCw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useProjectState } from '@/hooks/useProjectState';
import type { ProjectState } from '@/types/project';
import { AssetHeader } from '@/components/asset/AssetHeader';
import { AssetPhoto } from '@/components/asset/AssetPhoto';
import { InvestPanel } from '@/components/asset/InvestPanel';
import { MobileInvestBar } from '@/components/asset/MobileInvestBar';
import { ProjectTerms } from '@/components/asset/ProjectTerms';
import { CarPayouts } from '@/components/asset/CarPayouts';
import { PayoutCalculator } from '@/components/asset/PayoutCalculator';
import { TelemetryWidget } from '@/components/asset/TelemetryWidget';
import { approvalOf } from '@/components/asset/saleState';
import { useWalletApproval } from '@/components/asset/useWalletApproval';
import { InvestModal } from '@/components/invest/InvestModal';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { Skeleton } from '@/components/ui/Skeleton';
import { NETWORK_NAME } from '@/lib/network';

function AssetSkeleton(): JSX.Element {
  return (
    <div aria-busy="true" className="pt-8">
      <Skeleton className="h-7 w-24 rounded-pill" />
      <Skeleton className="mt-4 h-12 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-5 w-64" />
      <div className="mt-10 grid gap-8 lg:grid-cols-12 lg:gap-12">
        <Skeleton className="aspect-[4/3] w-full rounded-card lg:col-span-7" />
        <Skeleton className="h-80 w-full rounded-card lg:col-span-5" />
      </div>
    </div>
  );
}

function AssetDetails({ project, onChanged }: { project: ProjectState; onChanged: () => void }) {
  const tNav = useTranslations('Navigation');
  const tAsset = useTranslations('Asset');
  const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);
  const approval = approvalOf(useWalletApproval());
  const carName = `${project.carMake} ${project.carModel} ${project.carYear}`;
  const openInvest = () => setIsInvestModalOpen(true);

  return (
    <>
      <nav aria-label={tAsset('breadcrumb')}>
        <ol className="flex flex-wrap items-center gap-x-2 text-small text-muted-foreground">
          <li>
            <Link
              href="/#vehicles"
              className="-mx-2 inline-flex min-h-11 items-center px-2 underline-offset-4 transition-colors duration-fast ease-move hover:text-foreground hover:underline"
            >
              {tNav('catalog')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-foreground">
            {carName}
          </li>
        </ol>
      </nav>

      <div className="mt-4">
        <AssetHeader project={project} />
      </div>

      {/* DOM order is the mobile order: photo, then the invest panel, then the details. */}
      <div className="mt-8 grid gap-10 md:mt-10 md:grid-cols-12 md:gap-x-6 md:gap-y-16 lg:gap-x-12">
        <div className="md:col-span-7">
          <AssetPhoto project={project} />
        </div>
        <div className="md:col-span-5 md:col-start-8 md:row-start-1 lg:row-span-2">
          <div className="lg:sticky lg:top-24">
            <InvestPanel project={project} approval={approval} onBuy={openInvest} />
          </div>
        </div>
        <div className="flex flex-col gap-16 md:col-span-12 lg:col-span-7">
          <ProjectTerms project={project} />
          <CarPayouts project={project} />
          <PayoutCalculator project={project} />
          <TelemetryWidget projectId={project.mint} />
        </div>
      </div>

      <MobileInvestBar project={project} approval={approval} onBuy={openInvest} />

      <InvestModal
        isOpen={isInvestModalOpen}
        onClose={() => setIsInvestModalOpen(false)}
        projectMint={project.mint}
        adminPubkey={project.admin}
        pricePerToken={project.pricePerToken}
        tokensRemaining={project.tokensRemaining}
        carName={carName}
        onPurchased={onChanged}
      />
    </>
  );
}

export default function AssetDetailsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('Asset');
  const { projects, isLoading, error, refetch } = useProjectState();

  // A car is addressed by its share-token mint; the catalog index is kept for old links.
  const project = projects.find((p, index) => p.mint === id || String(index) === id);

  let content: React.ReactNode;
  if (project) {
    // A refetch after a purchase keeps the page on screen instead of flashing the skeleton.
    content = <AssetDetails project={project} onChanged={refetch} />;
  } else if (error) {
    content = (
      <Notice
        as="h1"
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="secondary" onClick={refetch}>
            <RotateCw aria-hidden="true" strokeWidth={1.75} />
            {t('retry')}
          </Button>
        }
      />
    );
  } else if (isLoading) {
    content = <AssetSkeleton />;
  } else {
    content = (
      <Notice
        as="h1"
        title={t('notFound')}
        body={t('notFoundBody', { network: NETWORK_NAME })}
        action={
          <Link href="/#vehicles" className={buttonClasses()}>
            {t('backToCatalog')}
          </Link>
        }
      />
    );
  }

  return <div className="page-container pb-32 pt-6 md:pb-24 md:pt-8">{content}</div>;
}
