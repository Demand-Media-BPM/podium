import { useCallback, useEffect, useState } from 'react';
import { listResponses } from '../services/responseApi.js';
import { getApiError } from '../utils/format.js';

// Loads the submitted responses of one request (employee side). Ownership is enforced by the backend.
export default function useResponses(requestId, { limit = 20 } = {}) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading', responses: [], pagination: null, error: '' });

  const load = useCallback(
    async (targetPage) => {
      setState((current) => ({ ...current, status: 'loading', error: '' }));
      try {
        const data = await listResponses(requestId, { page: targetPage, limit });
        setState({ status: 'ready', responses: data.responses, pagination: data.pagination, error: '' });
      } catch (err) {
        setState((current) => ({ ...current, status: 'error', error: getApiError(err, 'Could not load the responses.').message }));
      }
    },
    [requestId, limit]
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  return { ...state, page, setPage, reload: () => load(page) };
}
