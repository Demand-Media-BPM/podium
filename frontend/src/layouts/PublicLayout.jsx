import { useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { createMicrositeTheme, getMicrosite } from '../themes/microsites/index.js';
import { Outlet } from 'react-router-dom';
import { Box, Container, Typography } from '@mui/material';
import BrandMark from '../components/ui/BrandMark.jsx';
import { APP_NAME } from '../constants.js';

// Layout for clients: no employee navigation, no login link, nothing about the internal tool beyond its name.
export default function PublicLayout() {
  const [microsite, setMicrosite] = useState(null);
  const theme = useMemo(() => createMicrositeTheme(microsite), [microsite]);
  const site = getMicrosite(microsite);
  return (
    <ThemeProvider theme={theme}>
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ bgcolor: site?.primary || 'background.paper', color: site ? theme.palette.primary.contrastText : 'text.primary', borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="lg" sx={{ py: 1.75 }}>
          {site ? (
            <Box sx={{ width: 'fit-content', maxWidth: '100%', p: 1, borderRadius: 1, bgcolor: site.logoBackground }}>
              <Box component="img" src={site.logo} alt={site.name} sx={{ display: 'block', height: { xs: 48, sm: 64 }, width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
            </Box>
          ) : <BrandMark size={32} />}
        </Container>
      </Box>

      <Container maxWidth="lg" component="main" id="main-content" sx={{ flex: 1, py: { xs: 2.5, md: 4 }, px: { xs: 2, sm: 3 } }}>
        <Outlet context={{setMicrosite}} />
      </Container>

      <Box component="footer" sx={{ py: 2.5, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {site?.name || APP_NAME}
        </Typography>
      </Box>
    </Box>
    </ThemeProvider>
  );
}
