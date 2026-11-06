import { useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { getApiError } from '../../utils/format.js';

export default function UserDialog({account, currentUserId, onSave, onClose}) {
  const editing = Boolean(account);
  const self = account?.id === currentUserId;
  const [form, setForm] = useState({name:account?.name || '',email:account?.email || '',password:'',role:account?.role || 'employee',isActive:account?.isActive ?? true});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const change = field => event => {
    setForm(prev => ({...prev,[field]: field === 'isActive' ? event.target.checked : event.target.value}));
    setErrors(prev => ({...prev,[field]:undefined}));
  };
  const submit = async event => {
    event.preventDefault();
    if(inFlight.current) return;
    const found = {};
    if(!form.name.trim() || form.name.trim().length > 100) found.name = 'Enter a name of up to 100 characters';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 254) found.email = 'Enter a valid email address';
    if(!editing && (form.password.length < 12 || form.password.length > 128)) found.password = 'Use between 12 and 128 characters';
    setErrors(found);setError('');
    if(Object.keys(found).length) return;
    inFlight.current = true;setSaving(true);
    try {
      const values = {name:form.name.trim(),email:form.email.trim(),role:form.role,...(editing ? {isActive:form.isActive} : {password:form.password})};
      await onSave(values);
    } catch(err) {
      const details = getApiError(err,'Could not save this account. Please try again.');
      setErrors(details.fieldErrors);setError(details.message);
    } finally {inFlight.current = false;setSaving(false);}
  };
  return <Dialog open onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="user-dialog-title">
    <Box component="form" onSubmit={submit} noValidate>
      <DialogTitle id="user-dialog-title">{editing ? 'Edit user' : 'Add user'}</DialogTitle>
      <DialogContent sx={{display:'grid',gap:2.5,pt:'12px !important'}}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField autoFocus required fullWidth label="Full name" autoComplete="off" value={form.name} onChange={change('name')} disabled={saving} error={Boolean(errors.name)} helperText={errors.name} slotProps={{htmlInput:{maxLength:100}}} />
        <TextField required fullWidth label="Email address" type="email" autoComplete="off" value={form.email} onChange={change('email')} disabled={saving} error={Boolean(errors.email)} helperText={errors.email} slotProps={{htmlInput:{maxLength:254}}} />
        {!editing && <TextField required fullWidth label="Password" type="password" autoComplete="new-password" value={form.password} onChange={change('password')} disabled={saving} error={Boolean(errors.password)} helperText={errors.password || 'Use 12 to 128 characters. Share the credentials with the user securely.'} slotProps={{htmlInput:{maxLength:128}}} />}
        <TextField select fullWidth label="Account type" value={form.role} onChange={change('role')} disabled={saving || self} error={Boolean(errors.role)} helperText={errors.role || 'Admins can manage all data and accounts. Users see only their own data.'}>
          <MenuItem value="employee">User</MenuItem><MenuItem value="admin">Admin</MenuItem>
        </TextField>
        {editing && <FormControlLabel control={<Switch checked={form.isActive} onChange={change('isActive')} disabled={saving || self} />} label="Account active" />}
        {self && <Typography variant="caption" color="text.secondary">You can update your name and email. Your own admin role and active status cannot be removed.</Typography>}
      </DialogContent>
      <DialogActions sx={{px:3,pb:3,gap:1}}>
        <Button onClick={onClose} color="inherit" disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create user'}</Button>
      </DialogActions>
    </Box>
  </Dialog>;
}
