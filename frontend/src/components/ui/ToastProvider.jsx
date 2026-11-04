import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const ToastContext = createContext(null);

// App-wide notifications. `toast.success('Saved')`, `toast.error('Could not save')`, `toast.info(...)`.
// One message is shown at a time; a new one replaces the old. Messages must never contain secrets or links.
export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ open: false, severity: 'info', message: '', key: 0 });

  const show = useCallback((severity, message) => {
    setToast((current) => ({ open: true, severity, message, key: current.key + 1 }));
  }, []);

  const api = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    }),
    [show]
  );

  const close = (event, reason) => {
    if (reason === 'clickaway') return;
    setToast((current) => ({ ...current, open: false }));
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={toast.key}
        open={toast.open}
        autoHideDuration={toast.severity === 'error' ? 8000 : 4500}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={close} severity={toast.severity} variant="filled" sx={{ width: '100%', boxShadow: 3 }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
