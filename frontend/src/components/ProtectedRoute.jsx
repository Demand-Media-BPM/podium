import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import FullPageLoader from './ui/FullPageLoader.jsx';

// UX-only gate for employee pages. The backend enforces the real security boundary.
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading, endReason } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader label="Checking session" />;

  if (!isAuthenticated) {
    // After an explicit logout, do not remember the page (the next person to sign in should land on the dashboard).
    const from = endReason === 'logout' ? undefined : `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from, reason: endReason }} />;
  }

  return <Outlet />;
}
