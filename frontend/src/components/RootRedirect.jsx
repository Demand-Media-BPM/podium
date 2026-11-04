import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import FullPageLoader from './ui/FullPageLoader.jsx';

// "/" and unknown paths: signed-in employees go to the dashboard, everyone else to the login page.
export default function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader label="Checking session" />;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}
