import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Paper, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SuccessMark from '../ui/SuccessMark.jsx';
import LinkRevealPanel from './LinkRevealPanel.jsx';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

const STEPS = [
  'Copy the link and send it by email or chat.',
  'Your client opens it, records an answer for every question and submits.',
  'Their response appears on this request.',
];

// Shown right after creation: the one and only place the full link is displayed for a new request.
export default function CreateRequestSuccess({ created, onCreateAnother }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, boxShadow: tokens.shadow.card, animation: enter() }}>
      <Box sx={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 1, mb: 3 }}>
        <SuccessMark />
        <Typography variant="h5" component="h2" sx={{ mt: 1 }}>
          Your request is ready
        </Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere', maxWidth: 520 }}>
          &ldquo;{created.request.title}&rdquo; has a private link. Send it to your client.
        </Typography>
      </Box>

      <LinkRevealPanel url={created.url} />

      <Box sx={{ mt: 3, p: 2.5, borderRadius: 3, bgcolor: 'background.default' }}>
        <Typography variant="subtitle2" gutterBottom>
          What happens next
        </Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, color: 'text.secondary' }}>
          {STEPS.map((step) => (
            <Typography component="li" variant="body2" key={step}>
              {step}
            </Typography>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap', mt: 3 }}>
        <Button onClick={onCreateAnother} color="inherit" startIcon={<AddRoundedIcon />}>
          Create another request
        </Button>
        <Button component={RouterLink} to={`/requests/${created.request.id}`} variant="contained" endIcon={<ArrowForwardRoundedIcon />}>
          View request
        </Button>
      </Box>
    </Paper>
  );
}
