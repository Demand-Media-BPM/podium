import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppBar, Box, Drawer, IconButton, Toolbar } from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import Sidebar, { SIDEBAR_WIDTH } from '../components/layout/Sidebar.jsx';
import BrandMark from '../components/ui/BrandMark.jsx';
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx';

// The employee shell: a fixed sidebar on desktop, a slide-in drawer on small screens. Pages render in <Outlet />.
export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef(null);

  // After navigating, move focus to the page content so keyboard and screen-reader users start at the top of it.
  // Only when the route actually changes: a fresh page load must keep the skip link as the first Tab stop. (Comparing
  // with the previous path, not a "first render" flag, because StrictMode runs mount effects twice in development.)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: 2000,
          bgcolor: 'primary.main',
          color: '#fff',
          px: 2,
          py: 1,
          borderRadius: 1,
          '&:focus': { top: 8 },
        }}
      >
        Skip to content
      </Box>

      {/* Top bar: only on small screens, where the sidebar is hidden. */}
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{ display: { md: 'none' }, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" aria-label="Open navigation menu" onClick={() => setMobileOpen(true)}>
            <MenuRoundedIcon />
          </IconButton>
          <BrandMark size={30} />
        </Toolbar>
      </AppBar>

      <Box component="aside" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={closeMobile}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, maxWidth: '86vw', boxSizing: 'border-box' } }}
        >
          <Sidebar pathname={pathname} onNavigate={closeMobile} />
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' } }}
        >
          <Sidebar pathname={pathname} />
        </Drawer>
      </Box>

      <Box
        component="main"
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          outline: 'none',
          px: { xs: 2, sm: 3, md: 5 },
          pt: { xs: 10, md: 5 },
          pb: 8,
        }}
      >
        <Box sx={{ maxWidth: 1120, mx: 'auto' }}>
          <Suspense fallback={<LoadingSkeleton variant="page" label="Loading page" />}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}
