import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Avatar, Box, Button, CircularProgress, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import BrandMark from '../ui/BrandMark.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getInitials } from '../../utils/people.js';
import { tokens } from '../../tokens.js';

export const SIDEBAR_WIDTH = 264;

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardRoundedIcon /> },
  { label: 'My Requests', to: '/requests', icon: <ListAltRoundedIcon /> },
  { label: 'Create Request', to: '/requests/new', icon: <AddCircleRoundedIcon /> },
];

// "My Requests" must not stay highlighted on /requests/new, and /requests/:id still counts as My Requests.
const isActive = (item, pathname) => {
  if (item.to === '/requests') return pathname === '/requests' || (pathname.startsWith('/requests/') && pathname !== '/requests/new');
  return pathname === item.to;
};

// A plain router Link is used (not NavLink): NavLink decides "active" by prefix matching and overrides aria-current,
// which would light up My Requests on /requests/new. isActive() above is the single source of truth instead.

export default function Sidebar({ pathname, onNavigate }) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  // After logout, ProtectedRoute redirects to /login by itself.
  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
        <BrandMark />
      </Box>

      <Box component="nav" aria-label="Main" sx={{ flex: 1, px: 1.5, overflowY: 'auto' }}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 1.5, display: 'block', mb: 0.5 }}>
          Menu
        </Typography>
        <List disablePadding sx={{ display: 'grid', gap: 0.5 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                sx={{
                  borderRadius: '10px',
                  py: 1,
                  color: active ? 'primary.main' : 'text.secondary',
                  bgcolor: active ? 'primary.light' : 'transparent',
                  fontWeight: 600,
                  '& .MuiListItemIcon-root': { color: 'inherit', minWidth: 38 },
                  '&:hover': { bgcolor: active ? 'primary.light' : tokens.color.neutralSoft },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: 600, fontSize: '0.92rem' } }} />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      <Box sx={{ p: 1.5, display: 'grid', gap: 1.25, borderTop: 1, borderColor: 'divider' }}>
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1, py: 0.5, minWidth: 0 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.light', color: 'primary.main', fontSize: '0.85rem', fontWeight: 700 }}>
              {getInitials(user.name)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {isAdmin ? 'Administrator' : 'Employee'}
              </Typography>
            </Box>
          </Box>
        )}
        <Button
          onClick={handleLogout}
          disabled={loggingOut}
          startIcon={loggingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutRoundedIcon />}
          color="inherit"
          sx={{ justifyContent: 'flex-start', color: 'text.secondary', px: 1.5 }}
        >
          {loggingOut ? 'Signing out...' : 'Log out'}
        </Button>
      </Box>
    </Box>
  );
}
