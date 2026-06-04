import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:   'bg-brand-500 text-white hover:bg-brand-600 shadow-neon-green hover:shadow-lg',
        secondary: 'bg-surface-700 text-white hover:bg-surface-600 border border-surface-600',
        ghost:     'text-gray-400 hover:text-white hover:bg-surface-700',
        danger:    'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20',
        neon:      'border border-brand-500/50 text-brand-400 hover:bg-brand-500/10 hover:border-brand-400 hover:shadow-neon-green',
      },
      size: {
        sm:  'h-8  px-3 text-sm',
        md:  'h-10 px-4 text-sm',
        lg:  'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const AstrumButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, leftIcon, rightIcon, children, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isLoading || props.disabled}
      ref={ref}
      {...props}
    >
      {isLoading
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  ),
);
AstrumButton.displayName = 'AstrumButton';
