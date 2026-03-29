"use client";

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProjectState } from '@/hooks/useProjectState';
import { ProjectStatus } from '@/types/project';
import { AssetCard } from '@/components/catalog/AssetCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { RpcErrorBoundary } from '@/components/shared/RpcErrorBoundary';

function HomePageContent(): JSX.Element {
  const t = useTranslations('HomePage');
  const tCatalog = useTranslations('Catalog');
  
  const { projects, isLoading, error, refetch } = useProjectState();
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('all');

  if (error) {
    throw error;
  }

  const filteredProjects = projects.filter((p) => filter === 'all' || p.status === filter);

  const statuses: { value: ProjectStatus | 'all'; label: string }[] = [
    { value: 'all', label: tCatalog('filterAll') },
    { value: 'fundraising', label: tCatalog('statusFundraising') },
    { value: 'active', label: tCatalog('statusActive') },
    { value: 'paused', label: tCatalog('statusPaused') },
    { value: 'closed', label: tCatalog('statusClosed') },
  ];

  return (
    <div className="flex flex-col items-center w-full pb-20">
      {/* Hero Section */}
      <section className="w-full bg-gradient-to-b from-gray-50 to-white pt-24 pb-16 px-5 border-b border-gray-100 flex justify-center">
        <div className="max-w-[1200px] w-full text-center animate-fade-in">
          <h1 className="text-display-lg text-text-primary mb-4 font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-title-2 text-text-secondary font-normal mb-8 max-w-2xl mx-auto">
            {t('subtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => setFilter(s.value)}
                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  filter === s.value 
                    ? 'bg-text-primary text-white shadow-md' 
                    : 'bg-[#F5F5F7] text-text-secondary hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="w-full max-w-[1200px] px-5 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col bg-white rounded-2xl border border-gray-100 p-0 overflow-hidden shadow-sm h-[400px]">
                <Skeleton className="w-full h-[60%] rounded-none" />
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <Skeleton className="w-3/4 h-6 rounded-md" />
                  <Skeleton className="w-1/2 h-4 rounded-md" />
                  <div className="mt-auto">
                    <Skeleton className="w-full h-2 rounded-full mb-3" />
                    <Skeleton className="w-full h-10 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredProjects.map((project) => (
              <AssetCard key={project.mint} project={project} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-20 h-20 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{tCatalog('emptyTitle')}</h3>
            <p className="text-gray-500 max-w-md">{tCatalog('emptySubtitle')}</p>
            <button 
              onClick={() => setFilter('all')}
              className="mt-6 px-6 py-2 bg-[#F5F5F7] hover:bg-gray-200 transition-colors rounded-full text-sm font-medium"
            >
              Reset Filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function HomePage(): JSX.Element {
  const { refetch } = useProjectState();
  return (
    <RpcErrorBoundary onReset={refetch}>
      <HomePageContent />
    </RpcErrorBoundary>
  );
}
