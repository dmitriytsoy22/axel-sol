'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert, ArrowUpRight } from 'lucide-react';

export function KycPrompt() {
  const t = useTranslations('Kyc');
  
  // Note: For real environment this URL might come from an env variable or config.
  const kycProviderUrl = 'https://kyc.blockpass.org/';

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group transition-all duration-500 hover:border-cyan-500/30 w-full max-w-2xl mx-auto">
      {/* Decorative gradient blob */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/20 blur-[100px] rounded-full pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
      
      <div className="relative z-10 bg-white/10 p-4 rounded-full mb-6 border border-white/10 text-cyan-400">
        <ShieldAlert size={32} strokeWidth={1.5} />
      </div>
      
      <h3 className="relative z-10 text-2xl font-semibold text-white mb-3 tracking-tight">
        {t('title')}
      </h3>
      
      <p className="relative z-10 text-[#A0A0A0] mb-8 max-w-md mx-auto leading-relaxed">
        {t('description')}
      </p>
      
      <a
        href={kycProviderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="relative z-10 inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-black font-medium rounded-full hover:bg-gray-100 active:scale-95 transition-all duration-200"
      >
        <span>{t('cta')}</span>
        <ArrowUpRight size={18} strokeWidth={2} className="text-gray-500" />
      </a>
    </div>
  );
}
