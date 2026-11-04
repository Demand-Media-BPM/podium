import { Box, CircularProgress } from '@mui/material';
import BrandMark from './BrandMark.jsx';

// Full-screen loading state (checking the session, loading a lazy page).
export default function FullPageLoader({ label = 'Loading' }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
      <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
        <BrandMark showName={false} size={44} />
        <CircularProgress size={26} aria-label={label} />
      </Box>
    </Box>
  );
}
