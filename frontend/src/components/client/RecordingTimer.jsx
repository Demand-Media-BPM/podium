import { Box, Typography } from '@mui/material';
import { useRecorderValue, select } from '../../hooks/useRecorder.js';
import { MAX_DURATION_SECONDS } from '../../constants.js';
import { formatClock } from '../../utils/format.js';
import { pulse } from '../../styles/motion.js';

// The red "REC" badge with elapsed and remaining time. It subscribes to the recorder's elapsed seconds itself, so
// only this small component re-renders once a second. It is only rendered while the recorder status is 'recording':
// i.e. after MediaRecorder has really started, never during the countdown.
export function RecordingBadge({ controller }) {
  const elapsed = useRecorderValue(controller, select.elapsedSeconds);
  const remaining = Math.max(0, (controller.maxSeconds ?? MAX_DURATION_SECONDS) - elapsed);

  return (
    <Box
      role="timer"
      aria-label={`Recording. ${formatClock(elapsed)} elapsed, ${formatClock(remaining)} remaining`}
      sx={{
        position: 'absolute',
        top: 14,
        left: 14,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.6,
        borderRadius: 999,
        bgcolor: 'rgba(15, 20, 36, 0.78)',
        color: '#fff',
        backdropFilter: 'blur(6px)',
      }}
    >
      <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#F43F5E', animation: `${pulse} 1.4s ease-in-out infinite` }} />
      <Typography component="span" variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.06em' }}>
        REC
      </Typography>
      <Typography component="span" variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {formatClock(elapsed)} / {formatClock(controller.maxSeconds ?? MAX_DURATION_SECONDS)}
      </Typography>
    </Box>
  );
}

// "1:12 left", shown under the video. The last 15 seconds turn amber and are announced once per second politely.
export function RemainingTime({ controller }) {
  const elapsed = useRecorderValue(controller, select.elapsedSeconds);
  const remaining = Math.max(0, (controller.maxSeconds ?? MAX_DURATION_SECONDS) - elapsed);
  const low = remaining <= 15;

  return (
    <Typography
      variant="body2"
      role={low ? 'status' : undefined}
      sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: low ? 'warning.dark' : 'text.secondary' }}
    >
      {formatClock(remaining)} left{low ? '. Recording stops when the remaining time is used.' : ''}
    </Typography>
  );
}
