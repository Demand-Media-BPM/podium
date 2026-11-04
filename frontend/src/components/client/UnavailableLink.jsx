import { Box, Button, Paper, Typography } from '@mui/material';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import WifiOffRoundedIcon from '@mui/icons-material/WifiOffRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import { enter } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

const CASES = {
  unavailable: {
    icon: <LinkOffRoundedIcon sx={{ fontSize: 34 }} />,
    title: 'This link is not available',
    text: 'The link may be incorrect, expired, or no longer accepting responses. Please contact the person who sent it to you for a new link.',
  },
  rate_limited: {
    icon: <HourglassEmptyRoundedIcon sx={{ fontSize: 34 }} />,
    title: 'Please try again shortly',
    text: 'Too many requests were made. Wait a few minutes and reload this page.',
    retry: true,
  },
  error: {
    icon: <WifiOffRoundedIcon sx={{ fontSize: 34 }} />,
    title: 'We could not load this page',
    text: 'Please check your internet connection and try again.',
    retry: true,
  },
};

// Friendly full-page message for a link that cannot be used. Invalid, closed, expired and unknown links all look the
// same on purpose (the server gives no hint which one it is).
export default function UnavailableLink({ kind = 'unavailable' }) {
  const info = CASES[kind] || CASES.unavailable;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: { xs: 2, sm: 6 }, boxShadow: tokens.shadow.card, animation: enter() }}>
      <Box aria-hidden="true" sx={{ width: 72, height: 72, mx: 'auto', mb: 2, borderRadius: '20px', bgcolor: tokens.color.neutralSoft, color: 'text.secondary', display: 'grid', placeItems: 'center' }}>
        {info.icon}
      </Box>
      <Typography variant="h5" component="h1" gutterBottom>
        {info.title}
      </Typography>
      <Typography color="text.secondary">{info.text}</Typography>
      {info.retry && (
        <Button variant="contained" sx={{ mt: 3 }} onClick={() => window.location.reload()}>
          Try again
        </Button>
      )}
    </Paper>
  );
}
