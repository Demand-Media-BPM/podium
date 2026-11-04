import { useState } from 'react';
import { Box, Button, Dialog, TextField, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { formatDuration } from '../../utils/format.js';
import { validateEmail, validateName } from '../../utils/clientForm.js';
import { EMAIL_MAX, NAME_MAX } from '../../constants.js';

function Point({ icon, children }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
      <Box aria-hidden="true" sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'primary.light', color: 'primary.main', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}

// STEP A. The first thing a client sees on a valid link. It collects name and email ONLY: the camera is not touched
// until the client continues. The details are kept in React state by the parent for this visit and are not written
// to browser storage or sent anywhere except with the final submission.
//
// It cannot be dismissed with Escape or by clicking outside (that would leave a half-empty page), but it is never a
// dead end: the page behind it shows a "Get started" button that reopens it, and nothing can be recorded until it has
// been completed.
export default function WelcomeModal({ open, title, maxDurationSeconds, initialValues, onContinue }) {
  const [values, setValues] = useState({ name: initialValues?.name || '', email: initialValues?.email || '' });
  const [errors, setErrors] = useState({ name: '', email: '' });

  const validators = { name: validateName, email: validateEmail };
  const setField = (field) => (event) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a message as soon as the field becomes valid, without nagging while the client is still typing.
    if (errors[field] && !validators[field](value)) setErrors((current) => ({ ...current, [field]: '' }));
  };
  const blur = (field) => () => setErrors((current) => ({ ...current, [field]: validators[field](values[field]) }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = { name: validateName(values.name), email: validateEmail(values.email) };
    setErrors(found);
    if (found.name || found.email) return;
    onContinue({ name: values.name.replace(/\s+/g, ' ').trim(), email: values.email.trim() });
  };

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown
      aria-labelledby="welcome-title"
      aria-describedby="welcome-desc"
      slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxWidth: 460 } } }}
    >
      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ p: { xs: 3, sm: 4 } }}>
        <Box
          aria-hidden="true"
          sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: 'primary.main', color: '#fff', display: 'grid', placeItems: 'center', mb: 2, boxShadow: '0 6px 14px rgba(99, 91, 255, 0.3)' }}
        >
          <VideocamRoundedIcon />
        </Box>
        <Typography id="welcome-title" variant="h5" component="h2" gutterBottom>
          Welcome! Let&apos;s get your answer
        </Typography>
        <Typography id="welcome-desc" color="text.secondary" sx={{ mb: 2.5 }}>
          You have been asked to answer the questions with video{title ? <>: <strong style={{ overflowWrap: 'anywhere' }}>{title}</strong></> : ''}.
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.25, mb: 3, p: 2, borderRadius: 3, bgcolor: 'background.default' }}>
          <Point icon={<TimerOutlinedIcon fontSize="small" />}>Up to {formatDuration(maxDurationSeconds)} total across all answers.</Point>
          <Point icon={<ReplayRoundedIcon fontSize="small" />}>Watch it back and re-record as many times as you like before sending.</Point>
        </Box>

        <Box sx={{ display: 'grid', gap: 2.25 }}>
          <TextField
            label="Full name"
            name="name"
            autoComplete="name"
            autoFocus
            required
            fullWidth
            value={values.name}
            onChange={setField('name')}
            onBlur={blur('name')}
            error={Boolean(errors.name)}
            helperText={errors.name || ' '}
            slotProps={{ htmlInput: { maxLength: NAME_MAX + 20 } }}
          />
          <TextField
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            required
            fullWidth
            value={values.email}
            onChange={setField('email')}
            onBlur={blur('email')}
            error={Boolean(errors.email)}
            helperText={errors.email || 'So the team knows who the response is from.'}
            slotProps={{ htmlInput: { maxLength: EMAIL_MAX + 20, inputMode: 'email' } }}
          />
        </Box>

        <Button type="submit" variant="contained" size="large" fullWidth endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 1.5 }}>
          Continue to Recording
        </Button>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5, textAlign: 'center' }}>
          Your camera is only switched on in the next step, after you continue.
        </Typography>
      </Box>
    </Dialog>
  );
}
