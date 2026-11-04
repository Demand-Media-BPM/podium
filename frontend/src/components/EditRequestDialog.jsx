import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { QUESTION_MAX, TITLE_MAX } from '../constants.js';
import { isoToLocalInput, localInputToIso, nowLocalInput } from '../utils/format.js';

// Edits title, question and expiry. The public link does not change when a request is edited.
export default function EditRequestDialog({ open, request, busy, onSave, onClose }) {
  const [form, setForm] = useState({
    title: request.title,
    question: request.question,
    expiresAt: isoToLocalInput(request.expiresAt),
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const setField = (name) => (event) => {
    setForm((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSave = async () => {
    const next = {};
    if (!form.title.trim()) next.title = 'Title is required';
    else if (form.title.trim().length > TITLE_MAX) next.title = `Title must be at most ${TITLE_MAX} characters`;
    if (!form.question.trim()) next.question = 'Question is required';
    else if (form.question.trim().length > QUESTION_MAX) next.question = `Question must be at most ${QUESTION_MAX} characters`;

    const changes = { title: form.title, question: form.question };
    const originalExpiry = isoToLocalInput(request.expiresAt);
    if (form.expiresAt !== originalExpiry) {
      const iso = localInputToIso(form.expiresAt);
      if (form.expiresAt && !iso) next.expiresAt = 'Enter a valid date and time';
      else if (iso && new Date(iso) <= new Date()) next.expiresAt = 'Expiration must be in the future';
      else changes.expiresAt = iso; // null clears the expiry
    }

    setErrors(next);
    setError('');
    if (Object.keys(next).length > 0) return;

    const result = await onSave(changes);
    if (result.ok) onClose();
    else {
      setErrors(result.fieldErrors || {});
      setError('Could not save your changes.');
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit request</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2.5, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Request Title"
            value={form.title}
            onChange={setField('title')}
            error={Boolean(errors.title)}
            helperText={errors.title || `${form.title.length}/${TITLE_MAX}`}
            disabled={busy}
            fullWidth
          />
          <TextField
            label="Question"
            value={form.question}
            onChange={setField('question')}
            error={Boolean(errors.question)}
            helperText={errors.question || `${form.question.length}/${QUESTION_MAX}`}
            multiline
            minRows={4}
            disabled={busy}
            fullWidth
          />
          <TextField
            label="Expiration (optional)"
            type="datetime-local"
            value={form.expiresAt}
            onChange={setField('expiresAt')}
            error={Boolean(errors.expiresAt)}
            helperText={errors.expiresAt || 'Clear the field to remove the expiration. Shown in your local time.'}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: nowLocalInput() } }}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
