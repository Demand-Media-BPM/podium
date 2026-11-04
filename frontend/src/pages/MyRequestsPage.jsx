import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PageHeader from '../components/ui/PageHeader.jsx';
import RequestsPanel from '../components/requests/RequestsPanel.jsx';
import useRequestList from '../hooks/useRequestList.js';
import { useAuth } from '../context/AuthContext.jsx';

// Every request, newest first, 15 per page. Same data source as the dashboard, without the summary cards.
export default function MyRequestsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const list = useRequestList({ pageSize: 15, withSummary: false });

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All requests' : 'My requests'}
        description={isAdmin ? 'Every request created by your team.' : 'Everything you have asked clients to answer on video.'}
        actions={
          <Button component={RouterLink} to="/requests/new" variant="contained" startIcon={<AddRoundedIcon />}>
            Create request
          </Button>
        }
      />
      <RequestsPanel list={list} title={`${list.pagination ? list.pagination.total : ''} ${list.pagination?.total === 1 ? 'request' : 'requests'}`.trim() || 'Requests'} showOwner={isAdmin} />
    </>
  );
}
