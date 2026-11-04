import { Box, Button, Paper, Typography } from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import { formatDateTime, formatDuration } from '../../utils/format.js';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography fontWeight={600} component="div" sx={{ overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

// The question plus the key facts and the Edit / Close / Reopen actions. Question text is user-provided and rendered as
// plain text (React escapes it); whiteSpace keeps the author's line breaks.
export default function RequestOverview({ request, busy, onEdit, onToggleStatus }) {
  const isClosed = request.status === 'closed';

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 3 }, boxShadow: tokens.shadow.card, animation: enter(40) }}>
      <Typography variant="overline" color="text.secondary">
        Questions
      </Typography>
      <Typography variant="h6" component="p" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontWeight: 500, mt: 0.25, mb: 3 }}>
        {(request.questions || [{text:request.question}]).map((q,i)=><Box component="span" key={q.id || i} sx={{display:'block',mb:1}}>{i+1}. {q.text}</Box>)}
      </Typography>

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, py: 2.5, borderTop: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Fact label="Client">{request.clientName || '-'}</Fact>
        <Fact label="Created">{formatDateTime(request.createdAt)}</Fact>
        <Fact label="Link expires">{request.expiresAt ? formatDateTime(request.expiresAt) : 'Never'}</Fact>
        <Fact label="Total recording length">Up to {formatDuration(request.maxDurationSeconds)}</Fact>
        <Fact label="Responses">{request.responseCount}</Fact>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2.5 }}>
        <Button variant="outlined" color="inherit" startIcon={<EditRoundedIcon />} onClick={onEdit} disabled={Boolean(busy)}>
          Edit request
        </Button>
        <Button
          variant="outlined"
          color={isClosed ? 'success' : 'inherit'}
          startIcon={isClosed ? <LockOpenRoundedIcon /> : <LockRoundedIcon />}
          onClick={onToggleStatus}
          disabled={Boolean(busy)}
        >
          {isClosed ? 'Reopen request' : 'Close request'}
        </Button>
      </Box>
    </Paper>
  );
}
