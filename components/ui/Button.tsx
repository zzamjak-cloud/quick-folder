import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--qf-bg)] disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-[var(--qf-accent)] hover:bg-[var(--qf-accent-hover)] text-white focus:ring-[var(--qf-accent)]",
    secondary: "bg-[var(--qf-surface-2)] hover:bg-[var(--qf-surface-hover)] text-[var(--qf-text)] focus:ring-[var(--qf-accent)]",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 focus:ring-red-500",
    ghost: "hover:bg-[var(--qf-surface-hover)] text-[var(--qf-muted)] hover:text-[var(--qf-text)] focus:ring-[var(--qf-accent)]",
  };

  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};