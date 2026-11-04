import { Box } from '@mui/material';
import { tokens } from '../../tokens.js';

const { color: c } = tokens;

// One badge for every status in the app (requests and responses). A coloured dot plus a text label, so the meaning
// never depends on colour alone.
const TONES = {
  active: { label: 'Active', bg: c.successSoft, fg: c.successText, dot: c.success },
  closed: { label: 'Closed', bg: c.neutralSoft, fg: c.textMuted, dot: '#9AA1B0' },
  expired: { label: 'Expired', bg: c.warningSoft, fg: c.warning, dot: '#D97706' },
  submitted: { label: 'Submitted', bg: c.successSoft, fg: c.successText, dot: c.success },
  pending_upload: { label: 'Pending', bg: c.warningSoft, fg: c.warning, dot: '#D97706' },
  failed: { label: 'Failed', bg: c.dangerSoft, fg: '#B91C1C', dot: c.danger },
};

export default function StatusBadge({ status, label, size = 'medium' }) {
  const tone = TONES[status] || { label: 'Unknown', bg: c.neutralSoft, fg: c.textMuted, dot: '#9AA1B0' };
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: size === 'small' ? 1 : 1.25,
        py: size === 'small' ? 0.25 : 0.4,
        borderRadius: 999,
        bgcolor: tone.bg,
        color: tone.fg,
        fontSize: size === 'small' ? '0.75rem' : '0.8rem',
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.dot }} />
      {label || tone.label}
    </Box>
  );
}
