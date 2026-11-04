import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { apiUrl, getPlayback } from '../../services/responseApi.js';
import { describeVideoAccessError } from '../../utils/videoAccess.js';

// Plays one response. A fresh 60-second signed S3 URL is requested every time the dialog opens (nothing is cached or
// reused). The URL only has to be valid when playback STARTS: once the browser has begun streaming, playback continues
// even after the 60 seconds are over. If the browser later needs to re-request data after the URL expired (e.g. seeking
// after a long pause), the player shows an error and "Reload video" gets a new URL.
export default function VideoPlayerDialog({ open, response, onClose, onDownload }) {
  const videoRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', src: '', error: '', code: '', playerError: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !response) return undefined;
    let cancelled = false;
    setState({ status: 'loading', src: '', error: '', code: '', playerError: false });

    getPlayback(response.id)
      .then((result) => {
        if (cancelled) return;
        const src = result.kind === 'signed' ? result.url : apiUrl(result.path);
        setState({ status: 'ready', src, error: '', code: '', playerError: false });
      })
      .catch((err) => {
        if (cancelled) return;
        const { message, code } = describeVideoAccessError(err);
        setState({ status: 'error', src: '', error: message, code, playerError: false });
      });

    return () => {
      cancelled = true;
      // Stop playback and release the connection when the dialog closes or the video changes.
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [open, response, attempt]);

  const retryable = state.code !== 'VIDEO_EXPIRED' && state.code !== 'VIDEO_MISSING';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="video-dialog-title">
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, p: 3, pb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <DialogTitle id="video-dialog-title" sx={{ p: 0, overflowWrap: 'anywhere', fontWeight: 700 }}>
            {response ? response.clientName : 'Response'}
          </DialogTitle>
          {response && (
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {response.clientEmail}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="Close video" onClick={onClose} edge="end">
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <DialogContent>
        {state.status === 'loading' && (
          <Box sx={{ display: 'grid', placeItems: 'center', aspectRatio: '16 / 9', bgcolor: 'grey.100', borderRadius: 3 }}>
            <CircularProgress aria-label="Loading video" />
          </Box>
        )}
        {state.status === 'error' && (
          <Alert
            severity={retryable ? 'error' : 'warning'}
            action={retryable ? <Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>Try again</Button> : null}
          >
            {state.error}
          </Alert>
        )}
        {state.status === 'ready' && (
          <>
            {state.playerError && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={<Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>Reload video</Button>}
              >
                This video could not be played. It may be in a format your browser cannot play, or the secure link may have expired.
                You can download the file instead.
              </Alert>
            )}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              src={state.src}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setState((s) => ({ ...s, playerError: true }))}
              style={{ width: '100%', maxHeight: '68vh', background: '#0F1424', borderRadius: 12, display: 'block' }}
            />
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        {onDownload && response && (
          <Button color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={() => onDownload(response)} disabled={state.status === 'error' && !retryable}>
            Download
          </Button>
        )}
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
