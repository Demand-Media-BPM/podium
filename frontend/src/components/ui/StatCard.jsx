import { Box, Paper, Skeleton, Typography } from '@mui/material';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

// A summary number. `value` is null while loading (shows a skeleton). Real data only: never pass placeholder numbers.
export default function StatCard({ label, value, icon, caption, delay = 0 }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        animation: enter(delay),
        boxShadow: tokens.shadow.card,
        transition: `box-shadow ${tokens.motion.base}ms, transform ${tokens.motion.base}ms`,
        '&:hover': { boxShadow: tokens.shadow.raised, transform: 'translateY(-1px)' },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 44,
          height: 44,
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'primary.light',
          color: 'primary.main',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        {value === null || value === undefined ? (
          <Skeleton width={56} height={38} aria-label={`Loading ${label}`} />
        ) : (
          <Typography variant="h4" component="p" sx={{ lineHeight: 1.2 }}>
            {value}
          </Typography>
        )}
        {caption && (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
