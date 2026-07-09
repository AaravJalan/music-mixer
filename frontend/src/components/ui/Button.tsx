import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'spotify';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-purple/50 disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
      primary: 'bg-gradient-to-r from-accent-pink to-accent-purple hover:opacity-90 text-white shadow-lg shadow-accent-pink/20',
      secondary: 'glass hover:bg-white/10 text-white',
      ghost: 'hover:bg-white/5 text-white/70 hover:text-white',
      spotify: 'bg-accent-green hover:bg-accent-green/90 text-black font-semibold',
    };
    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    );
  },
);

Button.displayName = 'Button';
