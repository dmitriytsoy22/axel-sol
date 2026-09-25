'use client';

import React from 'react';
import { useProjectState } from '@/hooks/useProjectState';
import { CatalogHero } from '@/components/catalog/CatalogHero';
import { VehicleSection } from '@/components/catalog/VehicleSection';
import { HowItWorks } from '@/components/catalog/HowItWorks';
import { VerifySection } from '@/components/catalog/VerifySection';
import { DevnetDisclosure } from '@/components/catalog/DevnetDisclosure';
import type { CatalogFeed } from '@/components/catalog/types';

export default function HomePage(): JSX.Element {
  const { projects, isLoading, error, refetch } = useProjectState();
  // One read of the chain feeds every section; each shows its own loading and error state.
  const feed: CatalogFeed = { projects, isLoading, error, onRetry: refetch };

  return (
    <>
      <CatalogHero {...feed} />
      <VehicleSection {...feed} />
      <HowItWorks />
      <VerifySection {...feed} />
      <DevnetDisclosure />
    </>
  );
}
