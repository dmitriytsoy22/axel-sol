'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useProjectState } from '@/hooks/useProjectState';
import { AssetHeader } from '@/components/asset/AssetHeader';
import { FundingProgress } from '@/components/asset/FundingProgress';
import { InvestmentDetails } from '@/components/asset/InvestmentDetails';
import { RevenueProjection } from '@/components/asset/RevenueProjection';
import { InvestButton } from '@/components/asset/InvestButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ArrowLeft } from 'lucide-react';

export default function AssetDetailsPage(): React.JSX.Element {
  const { id } = useParams();
  const router = useRouter();
  const t = useTranslations('Asset');
  
  const { projects, isLoading } = useProjectState();
  
  // Find project by array index or mint address (to support both ways in UI mock)
  const project = projects.find(p => 
    p.mint === id || 
    projects.indexOf(p).toString() === id
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center w-full pb-20 pt-10 px-5">
        <div className="max-w-[1200px] w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
            <Skeleton className="w-3/4 h-10 mt-2" />
            <div className="flex gap-4">
              <Skeleton className="w-32 h-12" />
              <Skeleton className="w-32 h-12" />
            </div>
          </div>
          <div className="lg:col-span-5 flex flex-col gap-6">
            <Skeleton className="w-full h-48 rounded-2xl" />
            <Skeleton className="w-full h-64 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-2xl font-semibold mb-2">{t('notFound')}</h2>
        <button 
          onClick={() => router.push('/')}
          className="text-brand-primary font-medium hover:underline"
        >
          {t('backToCatalog')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full pb-28 lg:pb-20 pt-8 px-5">
      <div className="max-w-[1200px] w-full mb-6">
        <button 
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          {t('backToCatalog')}
        </button>
      </div>

      <div className="max-w-[1200px] w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 relative items-start">
        {/* Left Column: Image & Basic Info */}
        <div className="lg:col-span-7 flex flex-col gap-10">
          <AssetHeader project={project} />
          
          <div className="border-t border-gray-100 pt-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">{t('carSpecs')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col bg-[#F5F5F7] p-5 rounded-2xl">
                <span className="text-xs text-gray-500 mb-1 tracking-wide uppercase">Year</span>
                <span className="font-semibold text-gray-900">{project.carYear}</span>
              </div>
              <div className="flex flex-col bg-[#F5F5F7] p-5 rounded-2xl">
                <span className="text-xs text-gray-500 mb-1 tracking-wide uppercase">Class</span>
                <span className="font-semibold text-gray-900">Comfort+</span>
              </div>
              <div className="flex flex-col bg-[#F5F5F7] p-5 rounded-2xl">
                <span className="text-xs text-gray-500 mb-1 tracking-wide uppercase">Engine</span>
                <span className="font-semibold text-gray-900">2.0L Hybrid</span>
              </div>
              <div className="flex flex-col bg-[#F5F5F7] p-5 rounded-2xl">
                <span className="text-xs text-gray-500 mb-1 tracking-wide uppercase">Color</span>
                <span className="font-semibold text-gray-900">White</span>
              </div>
            </div>
          </div>
          
          <RevenueProjection />
        </div>

        {/* Right Column: Key Details & Investment (Sticky Desktop) */}
        <div className="lg:col-span-5 flex flex-col lg:sticky lg:top-24 gap-6">
          <FundingProgress project={project} />
          <InvestmentDetails project={project} />
          
          {/* Desktop Invest Button */}
          <div className="hidden lg:block mt-2">
            <InvestButton 
              isKycCompleted={true} 
              onInvestClick={() => console.log('Invest Clicked')} 
            />
          </div>
        </div>
      </div>

      {/* Mobile Sticky Invest Area */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-white/80 backdrop-blur-xl border-t border-gray-100 lg:hidden z-40">
        <InvestButton 
          isKycCompleted={true} 
          onInvestClick={() => console.log('Invest Clicked')} 
        />
      </div>
    </div>
  );
}
