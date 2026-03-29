'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useTelemetry } from '@/hooks/useTelemetry';
import { Activity, Route, Banknote, Car, AlertTriangle } from 'lucide-react';

export function TelemetryWidget(): JSX.Element | null {
  const t = useTranslations('Telemetry');
  const { data, isLoading, error, isStale } = useTelemetry();

  if (error) {
    return (
      <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-6 mb-8 mt-8" data-testid="telemetry-error">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm font-medium">{t('emptyState')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-32 bg-gray-100 dark:bg-gray-800/50 animate-pulse rounded-2xl mb-8 mt-8" data-testid="telemetry-loading" />
    );
  }

  if (!data || !data.available) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 mb-8 mt-8" data-testid="telemetry-empty">
        <div className="flex items-center gap-3 text-gray-500 max-w-sm mx-auto justify-center">
          <Car className="h-5 w-5 opacity-50" />
          <p className="text-sm font-medium text-center">{t('emptyState')}</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string): JSX.Element => {
    switch (status) {
      case 'active':
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold border border-green-200 dark:border-green-800">
            <div className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400 animate-pulse" />
            {t('statusInService')}
          </div>
        );
      case 'maintenance':
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-semibold border border-yellow-200 dark:border-yellow-800">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-600 dark:bg-yellow-400" />
            {t('statusMaintenance')}
          </div>
        );
      case 'inactive':
      default:
        return (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold border border-gray-200 dark:border-gray-700">
            <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            {t('statusInactive')}
          </div>
        );
    }
  };

  const formattedDate = data.date ? new Date(data.date).toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit' 
  }) : '';

  return (
    <div className="mb-8 mt-8 animate-in fade-in duration-500" data-testid="telemetry-widget">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-900 dark:text-white" />
          {t('title')}
        </h3>
        
        {isStale && (
          <span 
            className="text-xs font-medium bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-md border border-orange-200 dark:border-orange-800 flex items-center gap-1.5"
            data-testid="telemetry-stale"
          >
            <AlertTriangle className="h-3 w-3" />
            {t('staleData', { time: formattedDate })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Status Card */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Status</span>
          <div className="mt-3">
            {getStatusBadge(data.carStatus)}
          </div>
        </div>

        {/* Daily Revenue Card */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('dailyRevenue')}</span>
            <Banknote className="h-4 w-4 text-gray-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-white">
              <span className="text-gray-400 mr-1 font-medium">$</span>
              {data.dailyRevenue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Mileage Card */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('mileage')}</span>
            <Route className="h-4 w-4 text-gray-400" />
          </div>
          <div className="mt-2 text-gray-900 dark:text-white flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold">{data.mileageKm.toLocaleString()}</span>
            <span className="text-sm text-gray-500 font-normal">km</span>
          </div>
        </div>

        {/* Trips Card */}
        <div className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('trips')}</span>
            <Car className="h-4 w-4 text-gray-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-semibold text-gray-900 dark:text-white">{data.tripsCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
