import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonStyle {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  outline: 'border border-border bg-transparent text-foreground hover:bg-secondary',
  ghost: 'bg-transparent text-foreground hover:bg-secondary',
};

/* sm is 40px only from the sm breakpoint; touch widths keep a 44px target. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 sm:h-10 px-4 text-small gap-2 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-11 px-5 text-small gap-2 [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-12 px-6 text-body gap-2 [&_svg]:h-5 [&_svg]:w-5',
};

/** Button look for links and buttons alike: one primary per screen, the rest secondary or quieter. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: ButtonStyle = {}): string {
  return [
    'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium cursor-pointer select-none',
    'transition-colors duration-fast ease-move motion-reduce:transition-none',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    className,
  ].join(' ');
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyle {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...rest}
    />
  ),
);

Button.displayName = 'Button';
