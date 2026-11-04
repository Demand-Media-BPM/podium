import { Box, CircularProgress, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import VideocamOffRoundedIcon from '@mui/icons-material/VideocamOffRounded';
import LiveVideo from './LiveVideo.jsx';
import RecordingCountdown from './RecordingCountdown.jsx';
import { RecordingBadge } from './RecordingTimer.jsx';
import { fade } from '../../styles/motion.js';

function Message({ icon, title, children }) {
  return (
    <Box sx={{ color: 'rgba(255,255,255,0.9)', textAlign: 'center', p: 3, display: 'grid', gap: 1, justifyItems: 'center', maxWidth: 380, animation: fade() }}>
      {icon}
      <Typography variant="subtitle1" sx={{ color: '#fff' }}>
        {title}
      </Typography>
      {children && (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.78)' }}>
          {children}
        </Typography>
      )}
    </Box>
  );
}

// The 16:9 picture area. What it shows is decided only by the real recorder status and the countdown:
//   idle/requesting/error -> a message      ready -> live preview      countdown -> preview + 3,2,1
//   recording -> preview + red REC badge (only after MediaRecorder has actually started)
export default function RecorderStage({ controller, status, stream, countdown }) {
  const live = status === 'ready' || status === 'recording';

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: { xs: '4 / 3', sm: '16 / 9' },
        maxHeight: '70vh',
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: '#0F1424',
        display: 'grid',
        placeItems: 'center',
        boxShadow: status === 'recording' ? '0 0 0 3px rgba(244, 63, 94, 0.55)' : 'none',
        transition: 'box-shadow 220ms',
      }}
    >
      {status === 'idle' && (
        <Message icon={<VideocamRoundedIcon sx={{ fontSize: 44 }} />} title="Ready when you are">
          Press the button below to switch on your camera and microphone. Nothing is recorded yet.
        </Message>
      )}
      {status === 'requesting' && (
        <Message icon={<CircularProgress color="inherit" size={36} aria-label="Waiting for camera permission" />} title="Waiting for permission">
          Choose &quot;Allow&quot; when your browser asks to use the camera and microphone.
        </Message>
      )}
      {status === 'error' && <Message icon={<VideocamOffRoundedIcon sx={{ fontSize: 44, opacity: 0.8 }} />} title="Your camera is not available" />}

      {live && <LiveVideo stream={stream} />}
      {status === 'recording' && <RecordingBadge controller={controller} />}
      {live && <RecordingCountdown value={countdown.value} />}
    </Box>
  );
}
