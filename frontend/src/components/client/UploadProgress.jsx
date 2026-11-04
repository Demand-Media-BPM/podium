import { Box, LinearProgress, Typography } from '@mui/material';
import { enter } from '../../styles/motion.js';

// Real upload progress. `progress` is 0-100 as reported by the browser's upload events (through submissionFlow); it is
// never animated on its own. At 100 the bytes have left the browser, but the response is only "saved" once the server
// confirms, which is why the text then says "Saving".
export default function UploadProgress({ progress }) {
  const sending = progress < 100;
  return (
    <Box role="status" aria-live="polite" sx={{ p: 2.5, borderRadius: 3, bgcolor: 'primary.light', animation: enter() }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1.25 }}>
        <Typography fontWeight={600}>{sending ? 'Uploading your response...' : 'Upload complete. Saving your response...'}</Typography>
        <Typography fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(progress)}%
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, progress))} aria-label="Upload progress" />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Please keep this page open until it finishes.
      </Typography>
    </Box>
  );
}
