import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import QuestionEditor from './QuestionEditor.jsx';
import { MICROSITES } from '../../themes/microsites/index.js';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import { MAX_DURATION_SECONDS, TITLE_MAX } from '../../constants.js';
import { formatDuration, nowLocalInput } from '../../utils/format.js';

// The create-request fields. State and the API call live in useCreateRequestForm; this is presentation only.
export default function CreateRequestForm({ form, setField, fieldErrors, formError, submitting, onSubmit }) {
  return (
    <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 3 }}>
      {formError && (
        <Alert severity="error" role="alert">
          {formError}
        </Alert>
      )}

      <TextField
        label="Request title"
        placeholder="e.g. Project feedback"
        required
        autoFocus
        value={form.title}
        onChange={setField('title')}
        error={Boolean(fieldErrors.title)}
        helperText={fieldErrors.title || `A short name so you can find it later. ${form.title.length}/${TITLE_MAX}`}
        disabled={submitting}
        fullWidth
      />

      <TextField label="Client name" required value={form.clientName} onChange={setField('clientName')} disabled={submitting} error={Boolean(fieldErrors.clientName)} helperText={fieldErrors.clientName || 'Used to create the client link.'} fullWidth />
      <TextField select label="Select microsite" required value={form.microsite} onChange={setField('microsite')} disabled={submitting} error={Boolean(fieldErrors.microsite)} helperText={fieldErrors.microsite || 'The client page uses the selected microsite colors.'} fullWidth>
        {MICROSITES.map(site => <MenuItem key={site.id} value={site.id}>{site.name}</MenuItem>)}
      </TextField>
      <QuestionEditor questions={form.questions} onChange={questions => setField('questions')({target:{value:questions}})} error={fieldErrors.questions} disabled={submitting} />

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField
          label="Maximum total recording length"
          value={formatDuration(MAX_DURATION_SECONDS)}
          helperText="59 minutes shared across all answers."
          slotProps={{
            input: {
              readOnly: true,
              startAdornment: (
                <InputAdornment position="start">
                  <TimerOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          fullWidth
        />
        <TextField
          label="Link expires (optional)"
          type="datetime-local"
          value={form.expiresAt}
          onChange={setField('expiresAt')}
          error={Boolean(fieldErrors.expiresAt)}
          helperText={fieldErrors.expiresAt || 'Leave empty for a link that does not expire. Your local time.'}
          disabled={submitting}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: nowLocalInput() } }}
          fullWidth
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap', pt: 1 }}>
        <Button component={RouterLink} to="/dashboard" color="inherit" disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <AddRoundedIcon />}
        >
          {submitting ? 'Creating...' : 'Create request'}
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
        After you create it, you get a private link to send to your client.
      </Typography>
    </Box>
  );
}
