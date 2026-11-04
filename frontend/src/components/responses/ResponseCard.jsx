import { Avatar, Box, Button, CircularProgress, Paper, Tooltip, Typography } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatBytes, formatClock, formatDate, formatDateTime } from '../../utils/format.js';
import { getInitials } from '../../utils/people.js';
import { canAccessVideo } from '../../utils/videoAccess.js';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

// One client response. Names and emails come from clients (untrusted): React renders them as escaped text.
// `effectiveStatus` becomes "expired" the moment the retention deadline passes, before the cleanup job runs.
export default function ResponseCard({ response, onPlay, onDownload, downloading, index = 0 }) {
  const status = response.effectiveStatus || response.status;
  const available = canAccessVideo(response);
  const expired = status === 'expired';
  const reason = expired ? 'This video has passed its retention period and was removed' : 'This video is not available';

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        p: { xs: 2, sm: 2.5 },
        listStyle: 'none',
        boxShadow: tokens.shadow.card,
        animation: enter(Math.min(index, 6) * 40),
        transition: `box-shadow ${tokens.motion.base}ms, border-color ${tokens.motion.base}ms`,
        '&:hover': { boxShadow: tokens.shadow.raised, borderColor: tokens.color.borderStrong },
        opacity: expired ? 0.85 : 1,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'center', minWidth: 0 }}>
          <Avatar sx={{ bgcolor: 'primary.light', color: 'primary.main', fontWeight: 700, width: 44, height: 44 }}>{getInitials(response.clientName)}</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                {response.clientName}
              </Typography>
              <StatusBadge status={status} size="small" />
              {response.storageProvider === 'local' && <StatusBadge status="closed" label="Local test file" size="small" />}
            </Box>
            {response.questionText && <Typography variant="body2" fontWeight={600} sx={{mt:1,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{response.questionText}</Typography>}
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {response.clientEmail}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
          <Tooltip title={available ? '' : reason}>
            <span>
              <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => onPlay(response)} disabled={!available}>
                Play Video
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={available ? '' : reason}>
            <span>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={downloading ? <CircularProgress size={16} color="inherit" /> : <FileDownloadOutlinedIcon />}
                onClick={() => onDownload(response)}
                disabled={!available || downloading}
              >
                Download Video
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          mt: 2,
          pt: 1.75,
          borderTop: 1,
          borderColor: 'divider',
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        <Detail label="Submitted">{formatDateTime(response.submittedAt || response.createdAt)}</Detail>
        <Detail label="Length">{Number.isFinite(response.durationSeconds) ? formatClock(Math.round(response.durationSeconds)) : '-'}</Detail>
        <Detail label="File size">{formatBytes(response.fileSize)}</Detail>
        <Detail label={expired ? 'Video removed' : 'Video available until'} icon={<ScheduleRoundedIcon sx={{ fontSize: 15 }} />}>
          {formatDate(expired ? response.expiredAt || response.deleteAt : response.deleteAt)}
        </Detail>
      </Box>
    </Paper>
  );
}

function Detail({ label, icon, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {icon}
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {children}
      </Typography>
    </Box>
  );
}
