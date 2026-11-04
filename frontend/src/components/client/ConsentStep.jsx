import { useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, FormHelperText, Paper, Typography } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import UploadProgress from './UploadProgress.jsx';
import { CONSENT_TEXT, RETENTION_DAYS } from '../../constants.js';
import { formatClock } from '../../utils/format.js';
import { validateConsent } from '../../utils/clientForm.js';
import { enter } from '../../styles/motion.js';

function Row({ label, children }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1.1, '&:not(:last-child)': { borderBottom: 1, borderColor: 'divider' } }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right', overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

// STEP E: the last step before anything is uploaded. Shows who is submitting, asks for the required consent, and only
// then sends. The submit button is disabled while uploading (a second click cannot start a second upload) and the
// error area offers a safe retry (the same submission id is reused, so a retry never creates a duplicate).
export default function ConsentStep({ details, durationSeconds, consent, onConsentChange, submission, onSubmit, onBack, serverError }) {
  const [touched, setTouched] = useState(false);
  const consentError = touched ? validateConsent(consent) : '';
  const failed = submission.status === 'error';

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (validateConsent(consent)) return;
    onSubmit();
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2.5, animation: enter() }}>
      <Box>
        <Typography variant="h5" component="h2">
          Ready to send
        </Typography>
        <Typography color="text.secondary">Check your details, confirm, and submit your response.</Typography>
      </Box>

      <Paper variant="outlined" sx={{ px: 2.5, py: 1, borderColor: 'divider' }}>
        <Row label="Name">{details.name}</Row>
        <Row label="Email">{details.email}</Row>
        <Row label="Recording">
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} />
            Ready ({formatClock(Math.round(durationSeconds))})
          </Box>
        </Row>
      </Paper>

      <Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={consent}
              onChange={(e) => onConsentChange(e.target.checked)}
              disabled={submission.uploading}
              slotProps={{ input: { 'aria-required': true, 'aria-describedby': consentError ? 'consent-error' : 'consent-hint' } }}
            />
          }
          label={CONSENT_TEXT}
          sx={{ alignItems: 'flex-start', m: 0, '& .MuiCheckbox-root': { pt: 0.5, pl: 0, pr: 1.25 } }}
        />
        {consentError ? (
          <FormHelperText error id="consent-error" role="alert" sx={{ ml: 4.25 }}>
            {consentError}
          </FormHelperText>
        ) : (
          <FormHelperText id="consent-hint" sx={{ ml: 4.25 }}>
            Your video is kept for {RETENTION_DAYS} days, then deleted.
          </FormHelperText>
        )}
      </Box>

      {serverError && (
        <Alert severity="error" role="alert">
          {serverError}
        </Alert>
      )}
      {failed && (
        <Alert severity="error" role="alert">
          {submission.error}
          {submission.retryable && ' Your recording is still here. Press the button to try again.'}
        </Alert>
      )}

      {submission.uploading && <UploadProgress progress={submission.progress} />}

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} onClick={onBack} disabled={submission.uploading}>
          Back to review
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {submission.uploading && (
            <Button color="inherit" onClick={submission.cancel}>
              Cancel upload
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submission.uploading}
            startIcon={submission.uploading ? <CircularProgress size={18} color="inherit" /> : <SendRoundedIcon />}
          >
            {submission.uploading ? 'Submitting...' : failed && submission.retryable ? 'Try again' : 'Submit Response'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
