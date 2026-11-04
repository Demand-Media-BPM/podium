import { Box, Typography } from '@mui/material';
import { enter } from '../../styles/motion.js';

// A friendly "nothing here yet" block. `icon` is an MUI icon element; `action` is an optional button.
export default function EmptyState({ icon, title, description, action, compact = false }) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        px: 3,
        py: compact ? 4 : 7,
        display: 'grid',
        justifyItems: 'center',
        gap: 1,
        animation: enter(),
      }}
    >
      {icon && (
        <Box
          aria-hidden="true"
          sx={{
            width: 56,
            height: 56,
            borderRadius: '16px',
            bgcolor: 'primary.light',
            color: 'primary.main',
            display: 'grid',
            placeItems: 'center',
            mb: 0.5,
            '& svg': { fontSize: 28 },
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Box>
  );
}
