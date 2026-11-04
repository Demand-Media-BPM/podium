import { Link as RouterLink } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import RequestsPanel from '../components/requests/RequestsPanel.jsx';
import useRequestList from '../hooks/useRequestList.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getFirstName } from '../utils/people.js';

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const list = useRequestList({ pageSize: 10, withSummary: true });
  // Totals come from the API. While they load (or if loading failed) the cards show a skeleton, never a made-up number.
  const summary = list.summary;

  return (
    <>
      <PageHeader
        title={`Welcome back${user ? `, ${getFirstName(user.name)}` : ''}`}
        description={
          isAdmin
            ? 'Showing requests and responses from all employees.'
            : 'Here is how your video requests and client responses are doing.'
        }
        actions={
          <Button component={RouterLink} to="/requests/new" variant="contained" size="large" startIcon={<AddRoundedIcon />}>
            Create New Request
          </Button>
        }
      />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, mb: 3 }}>
        <StatCard label="Total Requests" value={summary ? summary.totalRequests : null} icon={<ListAltRoundedIcon />} caption="All requests created" />
        <StatCard
          label="Total Responses"
          value={summary ? summary.totalResponses : null}
          icon={<VideoLibraryRoundedIcon />}
          caption="Videos received"
          delay={60}
        />
        <StatCard
          label="Active Requests"
          value={summary ? summary.activeRequests : null}
          icon={<BoltRoundedIcon />}
          caption="Open and not expired"
          delay={120}
        />
      </Box>

      <RequestsPanel list={list} title={isAdmin ? 'All requests' : 'Recent requests'} showOwner={isAdmin} />
    </>
  );
}
