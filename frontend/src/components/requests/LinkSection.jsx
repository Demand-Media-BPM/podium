import { Alert, Box, Button, Chip, Paper, Typography } from '@mui/material';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import LinkRevealPanel from './LinkRevealPanel.jsx';
import { formatDateTime } from '../../utils/format.js';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

const BLOCKED_TEXT = {
  closed: 'This request is closed, so its link shows an "unavailable" message to clients. Reopen it to accept responses again.',
  expired: 'This request has expired, so its link shows an "unavailable" message to clients. Edit the request to remove or extend the expiry.',
};

// The shareable-link card. The full URL is only known right after creation/regeneration; otherwise the link cannot be
// shown (only a one-way hash is stored), so we explain that and offer to regenerate.
export default function LinkSection({ request, revealedLink, busy, onRegenerate }) {
  const live = request.effectiveStatus === 'active';

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, display: 'grid', gap: 2, boxShadow: tokens.shadow.card, animation: enter(80) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {live ? <LinkRoundedIcon color="primary" /> : <LinkOffRoundedIcon color="disabled" />}
          <Typography variant="h6" component="h2">
            Shareable link
          </Typography>
        </Box>
        <Chip size="small" color={live ? 'success' : 'default'} variant="outlined" label={live ? 'Accepting responses' : 'Not accepting responses'} />
      </Box>

      {revealedLink ? (
        <LinkRevealPanel url={revealedLink.url} regenerated={revealedLink.regenerated} />
      ) : (
        <Alert severity="info" icon={<LinkRoundedIcon fontSize="inherit" />}>
          For security, the full link is not stored and cannot be shown again. If you no longer have it, regenerate the link to get a new one.
        </Alert>
      )}

      {request.linkIssuedAt && (
        <Typography variant="body2" color="text.secondary">
          Current link created {formatDateTime(request.linkIssuedAt)}.
        </Typography>
      )}

      {!live && BLOCKED_TEXT[request.effectiveStatus] && <Alert severity="warning">{BLOCKED_TEXT[request.effectiveStatus]}</Alert>}

      <Box sx={{ display: 'flex', alignItems: { sm: 'center' }, gap: 2, flexDirection: { xs: 'column', sm: 'row' }, pt: 0.5 }}>
        <Button variant="outlined" color="warning" startIcon={<AutorenewRoundedIcon />} onClick={onRegenerate} disabled={Boolean(busy)}>
          Regenerate link
        </Button>
        <Typography variant="caption" color="text.secondary">
          Creates a new link and immediately stops the old one from working.
        </Typography>
      </Box>
    </Paper>
  );
}
