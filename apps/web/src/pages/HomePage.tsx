import { Navigate } from 'react-router';
import { useSession } from '../lib/auth-client';
import { usePermissions } from '../hooks/usePermissions';
import { useCompany } from '../hooks/useCompany';
import { Dashboard } from './Dashboard';

/**
 * Smart home page — routes users based on role and active company selection.
 * If no company is selected yet, redirects to the company selector.
 */
export function HomePage() {
  const { data: session, isPending } = useSession();
  const { isStaff, isAuthor, isProjectManager } = usePermissions();
  const { hasSelected } = useCompany();

  // Wait for session to load before deciding
  if (isPending || !session?.user) return null;

  // First visit after login: pick a company
  if (!hasSelected) return <Navigate to="/select-company" replace />;

  if (isStaff) return <Navigate to="/employee" replace />;
  if (isAuthor) return <Navigate to="/portal" replace />;
  if (isProjectManager) return <Navigate to="/pm" replace />;

  return <Dashboard />;
}
