import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Box, Paper, Typography } from '@mui/material';
import BrandMark from '../components/ui/BrandMark.jsx';
import FullPageLoader from '../components/ui/FullPageLoader.jsx';
import LoginForm from '../components/auth/LoginForm.jsx';
import LoginBrandPanel from '../components/auth/LoginBrandPanel.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSafeRedirect } from '../utils/redirect.js';
import { enter } from '../styles/motion.js';
import { tokens } from '../tokens.js';

function getErrorMessage(error) {
  if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
  switch (error.response.status) {
    case 400:
      return 'Please enter your email and password.';
    case 401:
      return 'Invalid email or password.';
    case 403:
      return 'This request was blocked for security reasons. Reload the page and try again.';
    case 429:
      return 'Too many login attempts. Please wait a few minutes and try again.';
    case 503:
      return 'The service is temporarily unavailable. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Only allow redirecting back to employee pages inside this app (prevents open redirects).
  const destination = getSafeRedirect(location.state?.from);
  const sessionExpired = location.state?.reason === 'expired';

  if (isLoading) return <FullPageLoader label="Checking session" />;
  // Already signed in: skip the form (also what happens right after a successful login).
  if (isAuthenticated) return <Navigate to={destination} replace />;

  const handleSubmit = async ({ email, password, clearPassword }) => {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      clearPassword();
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, bgcolor: 'background.default' }}>
      <LoginBrandPanel />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2.5, sm: 4 } }}>
        <Box sx={{ width: '100%', maxWidth: 420, animation: enter() }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 3 }}>
            <BrandMark />
          </Box>

          <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, boxShadow: tokens.shadow.raised }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Welcome back
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Sign in to create requests and review client responses.
            </Typography>
            <LoginForm onSubmit={handleSubmit} submitting={submitting} error={error} sessionExpired={sessionExpired} />
          </Paper>

          <Typography variant="caption" color="text.secondary" align="center" display="block" sx={{ mt: 3 }}>
            There is no public sign-up. Ask an administrator if you need an account.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
