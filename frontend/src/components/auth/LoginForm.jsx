import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField } from '@mui/material';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';

// The sign-in fields. The parent owns the request (it calls the real login API); this only collects input,
// shows the password toggle, and reports errors.
export default function LoginForm({ onSubmit, submitting, error, sessionExpired }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({ email, password, clearPassword: () => setPassword('') });
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2.25 }}>
      {sessionExpired && !error && <Alert severity="info">Your session has ended. Please sign in again.</Alert>}
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={submitting}
        fullWidth
      />
      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={submitting}
        fullWidth
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  onMouseDown={(e) => e.preventDefault()}
                  disabled={submitting}
                >
                  {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />

      <Button
        type="submit"
        variant="contained"
        size="large"
        fullWidth
        disabled={submitting}
        startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <LockRoundedIcon />}
      >
        {submitting ? 'Signing in...' : 'Sign in'}
      </Button>
    </Box>
  );
}
