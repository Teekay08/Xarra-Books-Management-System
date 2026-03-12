import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backTo?: { label: string; href: string };
}

export function PageHeader({ title, subtitle, action, backTo }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link to={backTo.href} className="mb-2 inline-flex items-center text-sm text-green-700 hover:underline">
          &larr; {backTo.label}
        </Link>
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
