import { useEffect } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SuccessMark from '../components/ui/SuccessMark.jsx';
import { hasRecentSubmission } from '../utils/thankYou.js';
import { enter } from '../styles/motion.js';
import { tokens } from '../tokens.js';

// Shown after the server has confirmed a saved response. If the page is opened directly (no recent confirmed submission in
// this browser tab) it shows a neutral message instead of claiming anything was submitted. No employee information, no
// personal details and nothing sensitive is shown here, and nothing about the submission is in the URL.
export default function ThankYouPage() {
  const submitted = hasRecentSubmission();

  // Move focus to the heading so screen-reader users hear the result straight away.
  useEffect(() => {
    document.getElementById('thank-you-heading')?.focus();
  }, []);

  if (!submitted) {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: { xs: 2, sm: 6 }, boxShadow: tokens.shadow.card, animation: enter() }}>
        <Box aria-hidden="true" sx={{ width: 72, height: 72, mx: 'auto', mb: 2, borderRadius: '20px', bgcolor: tokens.color.neutralSoft, color: 'text.secondary', display: 'grid', placeItems: 'center' }}>
          <InfoOutlinedIcon sx={{ fontSize: 34 }} />
        </Box>
        <Typography id="thank-you-heading" tabIndex={-1} variant="h5" component="h1" gutterBottom sx={{ outline: 'none' }}>
          Nothing has been submitted here
        </Typography>
        <Typography color="text.secondary">
          If you were sent a link to record a video response, please open that link to answer the question.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center', maxWidth: 520, mx: 'auto', mt: { xs: 2, sm: 6 }, boxShadow: tokens.shadow.card, animation: enter() }}>
      <Box sx={{ display: 'grid', justifyItems: 'center', mb: 2.5 }}>
        <SuccessMark size={96} />
      </Box>
      <Typography id="thank-you-heading" tabIndex={-1} variant="h4" component="h1" gutterBottom sx={{ outline: 'none' }}>
        Thank you for your response!
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Your video answers have been submitted successfully.
      </Typography>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 999, bgcolor: 'background.default', color: 'text.secondary' }}>
        <MarkEmailReadOutlinedIcon fontSize="small" />
        <Typography variant="body2">You can now close this page.</Typography>
      </Box>
    </Paper>
  );
}
