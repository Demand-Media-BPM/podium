import { Box, Tooltip, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import useBackendStatus from '../hooks/useBackendStatus.js';

const COLORS = {
  checking: 'warning.main',
  connected: 'success.main',
  error: 'error.main',
};

const LABELS = {
  checking: 'Checking backend…',
  connected: 'Backend connected',
  error: 'Backend offline',
};

export default function BackendStatus() {
  const { state, message } = useBackendStatus();

  return (
    <Tooltip title={message} placement="top">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} aria-live="polite">
        <CircleIcon sx={{ fontSize: 10, color: COLORS[state] }} />
        <Typography variant="caption" color="text.secondary">
          {LABELS[state]}
        </Typography>
      </Box>
    </Tooltip>
  );
}
