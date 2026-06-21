import type { CSSProperties, MouseEvent, ReactNode } from 'react';

interface PreviewIconActionButtonProps {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  buttonStyle: CSSProperties;
  icon: ReactNode;
  className?: string;
}

export function PreviewIconActionButton({
  label,
  onClick,
  buttonStyle,
  icon,
  className = 'hover:opacity-85',
}: PreviewIconActionButtonProps) {
  return (
    <div className="relative flex items-center group/qf-preview-tooltip">
      <button
        className={className}
        style={buttonStyle}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </button>
      <div
        className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[11px] opacity-0 translate-y-1 transition-all duration-150 group-hover/qf-preview-tooltip:translate-y-0 group-hover/qf-preview-tooltip:opacity-100"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          color: '#f8fafc',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
