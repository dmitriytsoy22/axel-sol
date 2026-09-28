import React from 'react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'destructiveOutline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Lets a long label wrap instead of pushing the button out of a narrow column, as Russian
   * and Kazakh labels do in a 320 px card. The height becomes a minimum.
   */
  wrap?: boolean;
  className?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  outline: 'border border-border bg-transparent text-foreground hover:bg-secondary',
  ghost: 'bg-transparent text-foreground hover:bg-secondary',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  destructiveOutline:
    'border border-destructive/40 bg-transparent text-destructive hover:bg-destructive-muted',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-4 text-small gap-2 [&_svg]:h-4 [&_svg]:w-4',
  md: 'px-5 text-small gap-2 [&_svg]:h-4 [&_svg]:w-4',
  lg: 'px-6 text-body gap-2 [&_svg]:h-5 [&_svg]:w-5',
};

/* sm is 40px only from the sm breakpoint; touch widths keep a 44px target. */
const HEIGHTS: Record<ButtonSize, { fixed: string; min: string }> = {
  sm: { fixed: 'h-11 sm:h-10', min: 'min-h-11 sm:min-h-10' },
  md: { fixed: 'h-11', min: 'min-h-11' },
  lg: { fixed: 'h-12', min: 'min-h-12' },
};

/** Button look for links and buttons alike: one primary per screen, the rest secondary or quieter. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  wrap = false,
  className = '',
}: ButtonStyle = {}): string {
  return [
    'inline-flex items-center justify-center rounded-control font-medium cursor-pointer select-none',
    wrap ? `${HEIGHTS[size].min} py-2 text-center` : `${HEIGHTS[size].fixed} whitespace-nowrap`,
    'transition-colors duration-fast ease-move motion-reduce:transition-none',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    className,
  ].join(' ');
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyle {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, wrap, className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, wrap, className })}
      {...rest}
    />
  ),
);

Button.displayName = 'Button';
