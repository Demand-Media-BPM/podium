import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, InputAdornment, Pagination, Paper, TextField, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import RequestsTable from './RequestsTable.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadingSkeleton from '../ui/LoadingSkeleton.jsx';
import { filterRequests } from '../../utils/requestSearch.js';
import { tokens } from '../../tokens.js';

// The request list with search, loading, empty and error states. Used by the dashboard and the My Requests page.
// `list` is the object returned by useRequestList.
export default function RequestsPanel({ list, title, showOwner, searchable = true }) {
  const [query, setQuery] = useState('');
  const loading = list.status === 'loading';
  const visible = filterRequests(list.requests, query);
  const multiPage = list.pagination && list.pagination.totalPages > 1;

  return (
    <Paper variant="outlined" sx={{ boxShadow: tokens.shadow.card, overflow: 'hidden' }}>
      <Box sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {searchable && list.requests.length > 0 && (
          <TextField
            size="small"
            type="search"
            placeholder="Search requests"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              htmlInput: { 'aria-label': 'Search requests' },
              input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> },
            }}
            sx={{ width: { xs: '100%', sm: 280 } }}
          />
        )}
      </Box>

      {list.status === 'error' && (
        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={list.reload}>Try again</Button>}>
            {list.error}
          </Alert>
        </Box>
      )}

      {loading && list.requests.length === 0 && <LoadingSkeleton variant="rows" count={4} label="Loading requests" />}

      {list.status === 'ready' && list.requests.length === 0 && (
        <EmptyState
          icon={<ListAltRoundedIcon />}
          title="No requests yet"
          description="Create your first request to get a private link you can send to a client."
          action={
            <Button component={RouterLink} to="/requests/new" variant="contained" startIcon={<AddRoundedIcon />}>
              Create your first request
            </Button>
          }
        />
      )}

      {list.requests.length > 0 && visible.length === 0 && (
        <EmptyState
          compact
          icon={<SearchOffRoundedIcon />}
          title="No matching requests"
          description={`Nothing on this page matches "${query.trim()}".${multiPage ? ' Search only covers the requests on the current page.' : ''}`}
          action={<Button color="inherit" onClick={() => setQuery('')}>Clear search</Button>}
        />
      )}

      {visible.length > 0 && (
        <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <RequestsTable requests={visible} showOwner={showOwner} />
        </Box>
      )}

      {query.trim() && visible.length > 0 && multiPage && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 2.5, pb: 1.5, display: 'block' }}>
          Search only covers the requests on this page.
        </Typography>
      )}

      {multiPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Pagination
            count={list.pagination.totalPages}
            page={list.page}
            onChange={(e, value) => list.setPage(value)}
            disabled={loading}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}
    </Paper>
  );
}
