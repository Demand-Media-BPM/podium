import { useRef } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// A confirmation before something that cannot be undone or changes what clients see. Focus starts on Cancel
// (the safe choice) and Escape / backdrop click cancel unless the action is running.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const danger = confirmColor === 'warning' || confirmColor === 'error';
  const cancelRef = useRef(null);
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      // MUI's focus trap focuses the dialog box itself; move focus to the SAFE choice once it has finished opening.
      slotProps={{ transition: { onEntered: () => cancelRef.current?.focus() } }}
    >
      <Box sx={{ display: 'flex', gap: 2, p: 3, pb: 1 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 40,
            height: 40,
            borderRadius: '12px',
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: danger ? 'warning.light' : 'primary.light',
            color: danger ? 'warning.dark' : 'primary.main',
          }}
        >
          {danger ? <WarningAmberRoundedIcon /> : <InfoOutlinedIcon />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <DialogTitle id="confirm-title" sx={{ p: 0, mb: 0.75, fontSize: '1.1rem', fontWeight: 700 }}>
            {title}
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            <DialogContentText id="confirm-body" component="div" sx={{ fontSize: '0.92rem' }}>
              {children}
            </DialogContentText>
          </DialogContent>
        </Box>
      </Box>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, gap: 1 }}>
        <Button ref={cancelRef} onClick={onCancel} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
