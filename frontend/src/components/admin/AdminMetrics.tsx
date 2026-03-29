'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ProjectState } from '@/types/project';

interface AdminMetricsProps {
  project: ProjectState;
}

export function AdminMetrics({ project }: AdminMetricsProps) {
  const t = useTranslations('Admin');

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl">
      <h2 className="mb-6 font-display text-xl font-medium tracking-tight text-white">
        {t('projectMetrics')}
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white/[0.03] p-5">
          <p className="mb-1 text-sm font-medium text-white/50">{t('metricStatus')}</p>
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  project.status === 'active' ? 'bg-cyan-400' : 'bg-white/40'
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  project.status === 'active' ? 'bg-cyan-500' : 'bg-white/60'
                }`}
              />
            </span>
            <span className="text-xl font-medium capitalize text-white">
              {project.status}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-5">
          <p className="mb-1 text-sm font-medium text-white/50">{t('solRaised')}</p>
          <p className="text-xl font-medium text-white">
            {(project.solRaised / 1_000_000_000).toFixed(2)} SOL
          </p>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-5">
          <p className="mb-1 text-sm font-medium text-white/50">{t('investors')}</p>
          <p className="text-xl font-medium text-white">{project.investorCount}</p>
        </div>
      </div>
    </div>
  );
}
