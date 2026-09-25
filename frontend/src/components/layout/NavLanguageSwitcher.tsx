'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LOCALE_OPTIONS } from './constants';

export function useSwitchLocale(): (code: string) => void {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  return useCallback(
    (code: string) => {
      if (code !== locale) router.replace(pathname, { locale: code });
    },
    [locale, pathname, router],
  );
}

export const NavLanguageSwitcher = (): JSX.Element => {
  const t = useTranslations('Navigation');
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = LOCALE_OPTIONS.find((option) => option.code === locale) ?? LOCALE_OPTIONS[0];

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${t('language')}: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-control px-2.5 text-small font-medium text-muted-foreground transition-colors duration-fast ease-move hover:bg-secondary hover:text-foreground"
      >
        <Globe aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        <span className="uppercase">{current.code}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      </button>

      {open && (
        <ul
          id={menuId}
          className="absolute right-0 top-full z-dropdown mt-2 w-44 animate-slide-down rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {LOCALE_OPTIONS.map(({ code, label }) => (
            <li key={code}>
              <button
                type="button"
                lang={code}
                aria-current={code === locale ? 'true' : undefined}
                onClick={() => {
                  setOpen(false);
                  switchLocale(code);
                }}
                className="flex h-10 w-full items-center justify-between rounded-control px-3 text-small text-foreground transition-colors duration-fast ease-move hover:bg-secondary"
              >
                {label}
                {code === locale && (
                  <Check aria-hidden="true" className="h-4 w-4 text-primary" strokeWidth={1.75} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
