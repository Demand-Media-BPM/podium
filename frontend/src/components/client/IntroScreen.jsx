import { Box, Button, Paper, Typography } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { formatDuration } from '../../utils/format.js';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

// What sits behind the welcome modal, and what the client returns to if the modal is closed. It makes the first
// step a place you can come back to rather than a dead end: "Get started" always reopens the modal.
export default function IntroScreen({ title, maxDurationSeconds, onStart }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', maxWidth: 560, mx: 'auto', mt: { xs: 2, sm: 6 }, boxShadow: tokens.shadow.card, animation: enter() }}>
      <Typography variant="overline" color="primary">
        You have been asked a question
      </Typography>
      <Typography variant="h4" component="h1" sx={{ my: 1.5, overflowWrap: 'anywhere' }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Answer with a short video of up to {formatDuration(maxDurationSeconds)}. It takes a minute, and you can re-record before you send it.
      </Typography>
      <Box>
        <Button variant="contained" size="large" startIcon={<PlayArrowRoundedIcon />} onClick={onStart}>
          Get started
        </Button>
      </Box>
    </Paper>
  );
}
