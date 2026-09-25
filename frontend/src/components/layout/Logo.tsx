/*
 * AXEL mark: an "A" whose crossbar is a cyan token. The legs take the text color of the
 * surface (ink on paper, paper on ink); the token is always the brand cyan.
 */
export const LogoMark = ({ className = '' }: { className?: string }): JSX.Element => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" className={className}>
    <path d="M16 3 4 29h6l6-14 6 14h6Z" fill="currentColor" />
    <circle cx="16" cy="22" r="3.2" className="fill-brand" />
  </svg>
);

export const Logo = ({ className = '' }: { className?: string }): JSX.Element => (
  <span className={`flex items-center gap-2 ${className}`}>
    <LogoMark className="h-7 w-7 shrink-0" />
    <span className="text-body font-semibold uppercase tracking-[0.14em]">AXEL</span>
  </span>
);
