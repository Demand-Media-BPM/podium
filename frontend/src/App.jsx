import { lazy, Suspense } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import RootRedirect from './components/RootRedirect.jsx';
import FullPageLoader from './components/ui/FullPageLoader.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ClientResponsePage from './pages/ClientResponsePage.jsx';
import ThankYouPage from './pages/ThankYouPage.jsx';

// Employee pages are loaded on demand, so a client opening a response link never downloads them.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const MyRequestsPage = lazy(() => import('./pages/MyRequestsPage.jsx'));
const CreateRequestPage = lazy(() => import('./pages/CreateRequestPage.jsx'));
const RequestDetailsPage = lazy(() => import('./pages/RequestDetailsPage.jsx'));

// The session check (/auth/me) only belongs to the employee side. Keeping the provider out of the public routes means
// a client opening a response link never triggers an authentication request.
function EmployeeSession() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function App() {
  return (
    <Suspense fallback={<FullPageLoader label="Loading" />}>
      <Routes>
        {/* Public client area (no sidebar, no authentication, no session check) */}
        <Route element={<PublicLayout />}>
          <Route path="/respond/:token" element={<ClientResponsePage />} />
          <Route path="/thank-you" element={<ThankYouPage />} />
        </Route>

        <Route element={<EmployeeSession />}>
          {/* Signed-in employees go to the dashboard, everyone else to the login page. */}
          <Route path="/" element={<RootRedirect />} />

          <Route path="/login" element={<LoginPage />} />

          {/* Employee area (sidebar layout). The route guard is for UX; the backend enforces access. */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/requests" element={<MyRequestsPage />} />
              <Route path="/requests/new" element={<CreateRequestPage />} />
              <Route path="/requests/:id" element={<RequestDetailsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
