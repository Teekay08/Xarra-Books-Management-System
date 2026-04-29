import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backTo?: { label: string; href: string };
}

export function PageHeader({ title, subtitle, action, backTo }: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    const hasHistory = (location.key && location.key !== 'default') || window.history.length > 1;
    if (hasHistory) navigate(-1);
    else if (backTo) navigate(backTo.href);
  };

  return (
    <div className="mb-5">
      {backTo && (
        <button
          type="button"
          onClick={handleBack}
          className="mb-2.5 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backTo.label}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </div>
    </div>
  );
}
