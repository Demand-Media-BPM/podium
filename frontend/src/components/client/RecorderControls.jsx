import { Alert, Box, Button, CircularProgress } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import FiberManualRecordRoundedIcon from '@mui/icons-material/FiberManualRecordRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { RemainingTime } from './RecordingTimer.jsx';

// The buttons under the picture. Each one is derived from the real recorder status and the countdown, so an action that
// is not valid right now is simply not offered (no Start during a countdown, no Stop before recording, etc.).
export default function RecorderControls({ controller, status, error, notice, countdown, onStart, onStop, onCancelCountdown, onRequestAccess }) {
  const recording = status === 'recording';
  const counting = countdown.active;

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {status === 'error' && error && (
        <Alert severity="error" role="alert">
          {error.message}
        </Alert>
      )}
      {notice && status !== 'recording' && <Alert severity="info">{notice}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(status === 'idle' || status === 'error') && (
            <Button variant="contained" size="large" startIcon={<VideocamRoundedIcon />} onClick={onRequestAccess}>
              {status === 'error' ? 'Try again' : 'Turn on camera and microphone'}
            </Button>
          )}

          {status === 'requesting' && (
            <Button variant="contained" size="large" disabled startIcon={<CircularProgress size={18} color="inherit" />}>
              Waiting for permission
            </Button>
          )}

          {status === 'ready' && !counting && (
            <Button variant="contained" color="error" size="large" startIcon={<FiberManualRecordRoundedIcon />} onClick={onStart}>
              Start Recording
            </Button>
          )}

          {status === 'ready' && counting && (
            <Button variant="outlined" color="inherit" size="large" startIcon={<CloseRoundedIcon />} onClick={onCancelCountdown}>
              Cancel
            </Button>
          )}

          {recording && (
            <Button variant="contained" color="inherit" size="large" startIcon={<StopRoundedIcon />} onClick={onStop} sx={{ bgcolor: 'text.primary', color: '#fff', '&:hover': { bgcolor: '#0F1424' } }}>
              Stop Recording
            </Button>
          )}
        </Box>

        {recording && <RemainingTime controller={controller} />}
      </Box>
    </Box>
  );
}
