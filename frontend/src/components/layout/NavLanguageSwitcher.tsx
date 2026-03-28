'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { Globe, ChevronDown, Check } from 'lucide-react';

export const NavLanguageSwitcher = (): JSX.Element => {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const switchLocale = useCallback((newLocale: string) => {
    router.replace(pathname as any, { locale: newLocale });
  }, [pathname, router]);

  return (
    <div className="hidden sm:block relative group">
      <button
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-surface-secondary hover:bg-surface-hover transition-colors duration-200 border border-transparent cursor-pointer"
        title="Switch Language"
      >
        <Globe size={18} className="text-text-secondary" strokeWidth={1.5} />
        <span className="text-[12px] font-semibold text-text-secondary tracking-[0.05em] uppercase">{locale}</span>
        <ChevronDown size={14} className="text-text-tertiary" strokeWidth={2} />
      </button>
      <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.1)] border border-border-subtle py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible origin-top-right scale-95 group-hover:scale-100 transition-all duration-200 ease-out z-dropdown">
        <button onClick={() => switchLocale('en')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
          <span className={locale === 'en' ? 'text-text-primary' : 'text-text-secondary'}>English</span>
          {locale === 'en' && <Check size={16} className="text-brand-primary" strokeWidth={2.5} />}
        </button>
        <button onClick={() => switchLocale('ru')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
          <span className={locale === 'ru' ? 'text-text-primary' : 'text-text-secondary'}>Русский</span>
          {locale === 'ru' && <Check size={16} className="text-brand-primary" strokeWidth={2.5} />}
        </button>
        <button onClick={() => switchLocale('kk')} className="w-full flex items-center justify-between px-4 py-2 text-[13px] font-medium hover:bg-surface-secondary transition-colors border-none bg-transparent cursor-pointer">
          <span className={locale === 'kk' ? 'text-text-primary' : 'text-text-secondary'}>Қазақша</span>
          {locale === 'kk' && <Check size={16} className="text-brand-primary" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
};
