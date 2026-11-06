import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
// Navigation guard only; the API also requires the current database role to be admin.
export default function AdminRoute() {
  const {user} = useAuth();
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
