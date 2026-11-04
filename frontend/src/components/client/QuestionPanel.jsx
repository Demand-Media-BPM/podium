import { Box, Paper, Typography } from '@mui/material';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import StepIndicator from './StepIndicator.jsx';
import { formatDuration } from '../../utils/format.js';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

function Tip({ icon, children }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', color: 'text.secondary' }}>
      <Box aria-hidden="true" sx={{ mt: 0.15, display: 'grid', placeItems: 'center', color: 'primary.main' }}>
        {icon}
      </Box>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

// LEFT SIDE of the recording screen. It stays on screen the whole time (sticky on large screens) so the client can
// re-read the question while recording. Question and title come from the employee and are rendered as plain text
// (React escapes them); whiteSpace keeps the author's line breaks.
export default function QuestionPanel({ title, question, maxDurationSeconds, stage }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2.5, md: 3.5 },
        boxShadow: tokens.shadow.card,
        animation: enter(),
        position: { md: 'sticky' },
        top: { md: 24 },
        display: 'grid',
        gap: 2.5,
        alignSelf: 'start',
      }}
    >
      <StepIndicator stage={stage} />

      <Box>
        <Typography variant="overline" component="h1" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <Typography variant="overline" color="primary" sx={{ display: 'block', mt: 1 }}>
          Your question
        </Typography>
        <Typography variant="h5" component="p" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontWeight: 600, mt: 0.5, lineHeight: 1.4 }}>
          {question}
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 1.25, pt: 2.5, borderTop: 1, borderColor: 'divider' }}>
        <Tip icon={<TimerOutlinedIcon fontSize="small" />}>You can record for up to {formatDuration(maxDurationSeconds)}.</Tip>
        <Tip icon={<ReplayRoundedIcon fontSize="small" />}>Not happy with it? You can watch it and record again before you send it.</Tip>
        <Tip icon={<LightbulbOutlinedIcon fontSize="small" />}>Find a quiet spot with the light in front of you, and speak naturally.</Tip>
      </Box>
    </Paper>
  );
}
