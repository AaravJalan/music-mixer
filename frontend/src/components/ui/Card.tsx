import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: 'pink' | 'purple' | 'cyan' | 'none';
}

export function Card({ glow = 'none', className = '', children, ...props }: CardProps) {
  const glowClass = glow === 'pink' ? 'glow-pink' : glow === 'purple' ? 'glow-purple' : glow === 'cyan' ? 'glow-cyan' : '';
  return (
    <div className={`glass rounded-2xl p-6 ${glowClass} ${className}`} {...props}>
      {children}
    </div>
  );
}
