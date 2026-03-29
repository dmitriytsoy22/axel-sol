import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Holding } from '@/hooks/useDashboard';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { ProjectState } from '@/types/project';

interface HoldingsTableProps {
  holdings: Holding[];
}

export function HoldingsTable({ holdings }: HoldingsTableProps): JSX.Element {
  const t = useTranslations('Dashboard');
  const catalogT = useTranslations('Catalog');

  const getStatusText = (status: ProjectState['status']): string => {
    switch (status) {
      case 'fundraising': return catalogT('statusFundraising');
      case 'active': return catalogT('statusActive');
      case 'paused': return catalogT('statusPaused');
      case 'closed': return catalogT('statusClosed');
      case 'finalized': return catalogT('statusFinalized');
      case 'initializing': return catalogT('statusInitializing');
      default: return status;
    }
  };

  if (holdings.length === 0) {
    return (
      <div data-testid="empty-holdings">
        <Card className="p-12 text-center rounded-2xl border-dashed">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noInvestments')}</h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">{t('noInvestmentsDesc')}</p>
          <Link href="/assets" className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-brand-primary hover:bg-cyan-600 focus:outline-none transition-colors">
            {t('exploreCatalog')}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden mb-8" data-testid="holdings-table">
      <div className="px-6 py-5 border-b border-gray-100 bg-white">
        <h3 className="text-lg font-medium text-gray-900">{t('holdings')}</h3>
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider text-left">
            <tr>
              <th className="px-6 py-4 font-medium">{t('asset')}</th>
              <th className="px-6 py-4 font-medium">{t('tokens')}</th>
              <th className="px-6 py-4 font-medium">{t('value')}</th>
              <th className="px-6 py-4 font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {holdings.map((holding) => {
              const valueSOL = (holding.tokensMinted * holding.project.pricePerToken) / 1_000_000_000;
              return (
                <tr key={holding.project.mint} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/assets/${holding.project.mint}`} className="flex items-center group">
                      <div className="flex-shrink-0 h-10 w-10 relative rounded-md overflow-hidden bg-gray-100">
                        <Image 
                          src={holding.project.imageUrl} 
                          alt={holding.project.carModel}
                          fill
                          sizes="40px"
                          className="object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 group-hover:text-brand-primary transition-colors">
                          {holding.project.carMake} {holding.project.carModel}
                        </div>
                        <div className="text-sm text-gray-500">{holding.project.carYear} • {holding.project.licensePlate}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {holding.tokensMinted.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    {valueSOL.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge status={holding.project.status}>
                      {getStatusText(holding.project.status)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="sm:hidden flex flex-col divide-y divide-gray-100">
        {holdings.map((holding) => {
           const valueSOL = (holding.tokensMinted * holding.project.pricePerToken) / 1_000_000_000;
           return (
            <div key={holding.project.mint} className="p-5 flex flex-col gap-4 bg-white">
              <div className="flex justify-between items-start gap-4">
                <Link href={`/assets/${holding.project.mint}`} className="flex items-center gap-3">
                  <div className="w-12 h-12 relative rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <Image src={holding.project.imageUrl} alt={holding.project.carModel} fill sizes="48px" className="object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-900 text-sm">{holding.project.carMake} {holding.project.carModel}</span>
                    <span className="text-gray-500 text-xs">{holding.project.carYear} • {holding.project.licensePlate}</span>
                  </div>
                </Link>
                <div className="flex-shrink-0">
                  <Badge status={holding.project.status}>{getStatusText(holding.project.status)}</Badge>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <div className="flex flex-col">
                  <span className="text-gray-500 text-xs">{t('tokens')}</span>
                  <span className="text-gray-900 font-medium text-sm">{holding.tokensMinted.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-gray-500 text-xs">{t('value')}</span>
                  <span className="text-brand-primary font-semibold text-sm">{valueSOL.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL</span>
                </div>
              </div>
            </div>
           );
        })}
      </div>
    </Card>
  );
}
