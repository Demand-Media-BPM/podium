import { useCallback, useEffect, useState } from 'react';
import { getRequestSummary, listRequests } from '../services/requestApi.js';
import { getApiError } from '../utils/format.js';

const INITIAL = { status: 'loading', summary: null, requests: [], pagination: null, error: '' };

// Loads the dashboard totals and one page of requests from the real API. `withSummary` is false on the
// My Requests page, which only needs the list.
export default function useRequestList({ pageSize = 10, withSummary = true } = {}) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState(INITIAL);

  const load = useCallback(
    async (targetPage) => {
      setState((current) => ({ ...current, status: 'loading', error: '' }));
      try {
        const [summary, list] = await Promise.all([
          withSummary ? getRequestSummary() : Promise.resolve(null),
          listRequests({ page: targetPage, limit: pageSize }),
        ]);
        setState({ status: 'ready', summary, requests: list.requests, pagination: list.pagination, error: '' });
      } catch (err) {
        setState((current) => ({
          ...current,
          status: 'error',
          error: getApiError(err, 'Could not load your requests.').message,
        }));
      }
    },
    [pageSize, withSummary]
  );

  useEffect(() => {
    load(page);
  }, [load, page]);

  return { ...state, page, setPage, reload: () => load(page) };
}
