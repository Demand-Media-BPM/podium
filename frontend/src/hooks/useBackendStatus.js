import { useEffect, useState } from 'react';
import { getHealth } from '../services/api.js';

// Returns { state: 'checking' | 'connected' | 'error', message }
export default function useBackendStatus() {
  const [status, setStatus] = useState({ state: 'checking', message: 'Checking backend…' });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((data) => {
        if (cancelled) return;
        if (data?.success) {
          setStatus({ state: 'connected', message: data.message });
        } else {
          setStatus({ state: 'error', message: 'Unexpected response from backend' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ state: 'error', message: 'Backend unreachable' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
