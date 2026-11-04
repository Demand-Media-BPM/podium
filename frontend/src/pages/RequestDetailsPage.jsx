import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import PageHeader from '../components/ui/PageHeader.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx';
import { useToast } from '../components/ui/ToastProvider.jsx';
import EditRequestDialog from '../components/requests/EditRequestDialog.jsx';
import LinkSection from '../components/requests/LinkSection.jsx';
import RequestOverview from '../components/requests/RequestOverview.jsx';
import ResponsesSection from '../components/responses/ResponsesSection.jsx';
import useRequestDetails from '../hooks/useRequestDetails.js';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';

export default function RequestDetailsPage() {
  const { id } = useParams();
  const details = useRequestDetails(id);
  const toast = useToast();
  const [dialog, setDialog] = useState(''); // '' | 'edit' | 'regenerate' | 'close'
  const { request } = details;

  if (details.status === 'loading') return <LoadingSkeleton variant="page" label="Loading request" />;

  if (details.status === 'error') {
    return (
      <>
        <PageHeader crumbs={[{ label: 'My requests', to: '/requests' }, { label: 'Request' }]} title="Request" />
        {details.notFound ? (
          <EmptyState
            icon={<SearchOffRoundedIcon />}
            title="Request not found"
            description="It may not exist, or you may not have access to it."
            action={<Button component={RouterLink} to="/requests" variant="contained" startIcon={<ArrowBackRoundedIcon />}>Back to my requests</Button>}
          />
        ) : (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>}>
            {details.error}
          </Alert>
        )}
      </>
    );
  }

  const isClosed = request.status === 'closed';

  const handleStatusClick = async () => {
    if (isClosed) {
      const result = await details.setStatus('active');
      if (result.ok) toast.success('Request reopened. The link accepts responses again.');
    } else {
      setDialog('close');
    }
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'My requests', to: '/requests' }, { label: request.title }]}
        title={request.title}
        badge={<StatusBadge status={request.effectiveStatus} />}
        description={request.createdBy?.name ? `Created by ${request.createdBy.name}` : undefined}
      />

      {details.actionError && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {details.actionError}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2.5 }}>
        <RequestOverview request={request} busy={details.busy} onEdit={() => setDialog('edit')} onToggleStatus={handleStatusClick} />
        <LinkSection request={request} revealedLink={details.revealedLink} busy={details.busy} onRegenerate={() => setDialog('regenerate')} />
        <Box sx={{ mt: 1 }}>
          <ResponsesSection requestId={request.id} responseCount={request.responseCount} />
        </Box>
      </Box>

      {dialog === 'edit' && (
        <EditRequestDialog
          open
          request={request}
          busy={details.busy === 'edit'}
          onSave={async (changes) => {
            const result = await details.save(changes);
            if (result.ok) toast.success('Changes saved.');
            return result;
          }}
          onClose={() => setDialog('')}
        />
      )}

      <ConfirmDialog
        open={dialog === 'regenerate'}
        title="Regenerate this link?"
        confirmLabel="Yes, regenerate link"
        confirmColor="warning"
        busy={details.busy === 'regenerate'}
        onCancel={() => setDialog('')}
        onConfirm={async () => {
          const result = await details.regenerate();
          setDialog('');
          if (result.ok) toast.success('New link generated. Copy it now.');
        }}
      >
        <strong>The current link stops working immediately.</strong> Anyone who still has the old link will see an
        &quot;unavailable&quot; message. You will get a new link to copy and share, and it is shown only once. Existing
        responses and request details are kept.
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'close'}
        title="Close this request?"
        confirmLabel="Close request"
        busy={details.busy === 'status'}
        onCancel={() => setDialog('')}
        onConfirm={async () => {
          const result = await details.setStatus('closed');
          setDialog('');
          if (result.ok) toast.info('Request closed. Clients will see an "unavailable" message.');
        }}
      >
        Clients opening the link will see an &quot;unavailable&quot; message until you reopen the request. The link itself is not
        changed, and you can reopen it at any time.
      </ConfirmDialog>
    </>
  );
}
