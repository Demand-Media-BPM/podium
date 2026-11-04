import { Alert, Box, Button, Typography } from '@mui/material';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import useObjectUrl from '../../hooks/useObjectUrl.js';
import { formatClock } from '../../utils/format.js';
import { enter } from '../../styles/motion.js';

// STEP D: the client watches their recording. The preview uses an object URL (revoked automatically when the blob
// changes or this component unmounts). Nothing has been uploaded at this point: that only happens after the client
// confirms on the next step.
export default function RecordingReview({ blob, durationSeconds, notice, onRerecord, onContinue }) {
  const url = useObjectUrl(blob);

  return (
    <Box sx={{ display: 'grid', gap: 2.5, animation: enter() }}>
      <Box>
        <Typography variant="h5" component="h2">
          Review your response
        </Typography>
        <Typography color="text.secondary">Watch it back. If you are happy with it, continue. Otherwise you can record it again.</Typography>
      </Box>

      <Box sx={{ borderRadius: 4, overflow: 'hidden', bgcolor: '#0F1424', aspectRatio: { xs: '4 / 3', sm: '16 / 9' }, maxHeight: '70vh' }}>
        {url && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls playsInline preload="metadata" aria-label="Your recorded response" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        )}
      </Box>

      {notice && <Alert severity="info">{notice}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          Length: <strong>{formatClock(Math.round(durationSeconds))}</strong>
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" color="inherit" size="large" startIcon={<ReplayRoundedIcon />} onClick={onRerecord}>
            Re-record
          </Button>
          <Button variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} onClick={onContinue}>
            Continue
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
