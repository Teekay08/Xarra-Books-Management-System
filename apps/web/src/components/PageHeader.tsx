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
    // If the user navigated here from within the app, go back in history.
    // Otherwise (direct load / external referrer), fall back to backTo.href.
    const hasHistory = (location.key && location.key !== 'default') || window.history.length > 1;
    if (hasHistory) {
      navigate(-1);
    } else if (backTo) {
      navigate(backTo.href);
    }
  };

  return (
    <div className="mb-6">
      {backTo && (
        <button
          type="button"
          onClick={handleBack}
          className="mb-2 inline-flex items-center text-sm text-green-700 hover:underline"
        >
          &larr; {backTo.label}
        </button>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
