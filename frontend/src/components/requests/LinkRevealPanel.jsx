import { Alert, AlertTitle, Box } from '@mui/material';
import CopyLinkField from '../ui/CopyLinkField.jsx';

// Shows a freshly generated link. This is the ONLY time the full link is available: the server stores a one-way
// hash of the token, so the link cannot be looked up again later. The URL comes from the API response, never made up.
export default function LinkRevealPanel({ url, regenerated = false }) {
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <CopyLinkField url={url} label={regenerated ? 'New public link' : 'Public link'} />
      <Alert severity="warning" variant="outlined" sx={{ bgcolor: 'warning.light', borderColor: 'transparent', alignItems: 'flex-start' }}>
        <AlertTitle>{regenerated ? 'New link generated: copy it now' : 'Copy this link now'}</AlertTitle>
        This is the only time the full link is shown. For security it is stored only as a one-way hash, so it cannot be
        recovered later. If you lose it, use <strong>Regenerate link</strong> to get a new one.
        {regenerated && ' Any link you shared earlier no longer works.'}
      </Alert>
    </Box>
  );
}
