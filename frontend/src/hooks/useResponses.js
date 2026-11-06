import { useCallback, useEffect, useRef, useState } from 'react';
import { listResponses } from '../services/responseApi.js';
import { getApiError } from '../utils/format.js';

// Each page contains complete submissions. Ignore stale responses after navigation or a newer refresh.
export default function useResponses(requestId, { limit = 5 } = {}) {
  const [location, setLocation] = useState({ requestId, page: 1 });
  const page = location.requestId === requestId ? location.page : 1;
  const [state, setState] = useState({ requestId, status: 'loading', submissions: [], pagination: null, error: '' });
  const generation = useRef(0);
  const setPage = useCallback(value => setLocation({ requestId, page: value }), [requestId]);
  const load = useCallback(async targetPage => {
    const ticket = ++generation.current;
    setState(current => ({
      ...current,
      ...(current.requestId !== requestId ? { requestId, submissions: [], pagination: null } : {}),
      status: 'loading', error: '',
    }));
    try {
      const data = await listResponses(requestId, { page: targetPage, limit });
      if (ticket !== generation.current) return;
      if (targetPage > data.pagination.totalPages) { setPage(data.pagination.totalPages); return; }
      setState({ requestId, status: 'ready', submissions: data.submissions, pagination: data.pagination, error: '' });
    } catch (err) {
      if (ticket !== generation.current) return;
      setState(current => ({ ...current, status: 'error', error: getApiError(err, 'Could not load the responses.').message }));
    }
  }, [requestId, limit, setPage]);
  useEffect(() => {
    load(page);
    return () => { generation.current += 1; };
  }, [load, page]);
  return { ...state, page, setPage, reload: () => load(page) };
}
