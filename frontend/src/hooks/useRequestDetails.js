import { useCallback, useEffect, useRef, useState } from 'react';
import { getRequest, regenerateRequestLink, updateRequest } from '../services/requestApi.js';
import { getApiError } from '../utils/format.js';

// Loads one request and exposes the actions on it. `revealedLink` holds a freshly generated URL in memory only:
// it is never stored, and disappears when the user leaves the page (the server cannot show it again).
export default function useRequestDetails(id) {
  const [state, setState] = useState({ status: 'loading', request: null, notFound: false, error: '' });
  const [revealedLink, setRevealedLink] = useState(null); // { url, regenerated }
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(''); // '' | 'status' | 'regenerate' | 'edit'
  const busyRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', request: null, notFound: false, error: '' });
    setRevealedLink(null);
    setActionError('');

    getRequest(id)
      .then((request) => !cancelled && setState({ status: 'ready', request, notFound: false, error: '' }))
      .catch((err) => {
        if (cancelled) return;
        const { message, status } = getApiError(err, 'Could not load this request.');
        const notFound = status === 404 || status === 400;
        setState({ status: 'error', request: null, notFound, error: notFound ? 'Request not found.' : message });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Runs one action at a time; returns { ok, fieldErrors } so dialogs can show server validation messages.
  const run = useCallback(async (name, action) => {
    if (busyRef.current) return { ok: false, fieldErrors: {} };
    busyRef.current = name;
    setBusy(name);
    setActionError('');
    try {
      await action();
      return { ok: true, fieldErrors: {} };
    } catch (err) {
      const { message, fieldErrors } = getApiError(err, 'That did not work. Please try again.');
      setActionError(message);
      return { ok: false, fieldErrors };
    } finally {
      busyRef.current = '';
      setBusy('');
    }
  }, []);

  const applyRequest = (request) => setState((current) => ({ ...current, request }));

  const save = useCallback((changes) => run('edit', async () => applyRequest(await updateRequest(id, changes))), [id, run]);

  const setStatus = useCallback((status) => run('status', async () => applyRequest(await updateRequest(id, { status }))), [id, run]);

  const regenerate = useCallback(
    () =>
      run('regenerate', async () => {
        const { request, url } = await regenerateRequestLink(id);
        applyRequest(request);
        setRevealedLink({ url, regenerated: true });
      }),
    [id, run]
  );

  return { ...state, revealedLink, actionError, busy, save, setStatus, regenerate, dismissLink: () => setRevealedLink(null) };
}
