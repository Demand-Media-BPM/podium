import { Box, Typography } from '@mui/material';
import { countIn, fadeIn } from '../../styles/motion.js';

// The big "3, 2, 1" laid over the live camera preview. The number is remounted (via `key`) on every tick so the
// pop-in animation replays. It is announced politely to screen readers.
export default function RecordingCountdown({ value }) {
  if (value === null || value === undefined) return null;
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'rgba(15, 20, 36, 0.55)',
        animation: `${fadeIn} 150ms ease both`,
        zIndex: 2,
      }}
    >
      <Box sx={{ textAlign: 'center', color: '#fff' }}>
        <Typography
          key={value}
          component="p"
          aria-label={`Recording starts in ${value}`}
          sx={{ fontSize: { xs: '5rem', sm: '7rem' }, fontWeight: 700, lineHeight: 1, m: 0, animation: `${countIn} 520ms cubic-bezier(0.2, 0, 0, 1) both`, textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
        >
          {value}
        </Typography>
        <Typography sx={{ mt: 1.5, color: 'rgba(255,255,255,0.9)' }}>Get ready. Recording starts soon.</Typography>
      </Box>
    </Box>
  );
}
