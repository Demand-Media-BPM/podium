import QuestionEditor from './QuestionEditor.jsx';
import { MICROSITES } from '../../themes/microsites/index.js';
import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { QUESTION_MAX, TITLE_MAX } from '../../constants.js';
import { isoToLocalInput, localInputToIso, nowLocalInput } from '../../utils/format.js';

// Edits title, question and expiry. The public link does not change when a request is edited.
export default function EditRequestDialog({ open, request, busy, onSave, onClose }) {
  const [form, setForm] = useState({
    title: request.title,
    question: request.question,
    clientName: request.clientName || '',
    microsite: request.microsite || '',
    questions: request.questions || [],
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
    if (request.microsite) {
      if (!form.clientName.trim()) next.clientName = 'Client name is required';
      if (!form.questions.length) next.questions = 'Add at least one question';
    } else if (!form.question.trim()) next.question = 'Question is required';

    const changes = request.microsite ? {title:form.title,clientName:form.clientName,microsite:form.microsite,questions:form.questions} : {title:form.title,question:form.question};
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
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="edit-request-title">
      <DialogTitle id="edit-request-title" sx={{ fontWeight: 700, pb: 0.5 }}>
        Edit request
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Changes apply straight away. The client link stays the same.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Request title"
            value={form.title}
            onChange={setField('title')}
            error={Boolean(errors.title)}
            helperText={errors.title || `${form.title.length}/${TITLE_MAX}`}
            disabled={busy}
            fullWidth
          />
          {request.microsite ? <>
            <TextField label="Client name" value={form.clientName} onChange={setField('clientName')} disabled={busy} error={Boolean(errors.clientName)} helperText={errors.clientName} fullWidth />
            <TextField select label="Select microsite" value={form.microsite} onChange={setField('microsite')} disabled={busy} fullWidth>{MICROSITES.map(site=><MenuItem key={site.id} value={site.id}>{site.name}</MenuItem>)}</TextField>
            <QuestionEditor questions={form.questions} onChange={questions=>setField('questions')({target:{value:questions}})} error={errors.questions} disabled={busy}/>
          </> : <TextField
            label="Your question"
            value={form.question}
            onChange={setField('question')}
            error={Boolean(errors.question)}
            helperText={errors.question || `${form.question.length}/${QUESTION_MAX}`}
            multiline
            minRows={4}
            disabled={busy}
            fullWidth
          />
          }
          <TextField
            label="Link expires (optional)"
            type="datetime-local"
            value={form.expiresAt}
            onChange={setField('expiresAt')}
            error={Boolean(errors.expiresAt)}
            helperText={errors.expiresAt || 'Clear the field to remove the expiry. Your local time.'}
            disabled={busy}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: nowLocalInput() } }}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
