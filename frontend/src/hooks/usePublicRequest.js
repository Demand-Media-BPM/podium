import { useEffect, useState } from 'react';
import { getPublicRequest } from '../services/requestApi.js';

// Loads the client-facing question. States: loading | ready | unavailable | rate_limited | error.
// Invalid, closed, expired and unknown links all arrive as the same 404 and are shown the same way.
export default function usePublicRequest(token) {
  const [state, setState] = useState({ status: 'loading', request: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', request: null });

    getPublicRequest(token)
      .then((request) => !cancelled && setState({ status: 'ready', request }))
      .catch((err) => {
        if (cancelled) return;
        const code = err.response?.status;
        if (code === 404 || code === 400) setState({ status: 'unavailable', request: null });
        else if (code === 429) setState({ status: 'rate_limited', request: null });
        else setState({ status: 'error', request: null });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
