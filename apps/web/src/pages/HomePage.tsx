import { Navigate } from 'react-router';
import { useSession } from '../lib/auth-client';
import { usePermissions } from '../hooks/usePermissions';
import { Dashboard } from './Dashboard';

/**
 * Smart home page that routes users to the appropriate dashboard based on their role.
 * - Staff → My Workspace (employee dashboard)
 * - Author → Author portal
 * - Everyone else → Main admin dashboard
 */
export function HomePage() {
  const { data: session, isPending } = useSession();
  const { isStaff, isAuthor } = usePermissions();

  // Wait for session to load before deciding
  if (isPending || !session?.user) return null;

  if (isStaff) return <Navigate to="/employee" replace />;
  if (isAuthor) return <Navigate to="/portal" replace />;

  return <Dashboard />;
}
