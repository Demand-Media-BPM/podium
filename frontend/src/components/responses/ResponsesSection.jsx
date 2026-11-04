import { useCallback, useState } from 'react';
import { Alert, Box, Button, Chip, Pagination, Typography } from '@mui/material';
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded';
import ResponseCard from './ResponseCard.jsx';
import VideoPlayerDialog from './VideoPlayerDialog.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadingSkeleton from '../ui/LoadingSkeleton.jsx';
import { useToast } from '../ui/ToastProvider.jsx';
import useResponses from '../../hooks/useResponses.js';
import { apiUrl, getDownload, submissionZipUrl } from '../../services/responseApi.js';
import { describeVideoAccessError } from '../../utils/videoAccess.js';
import { RETENTION_DAYS } from '../../constants.js';

// Starts a browser download from a URL. The signed S3 URL carries Content-Disposition: attachment with a safe
// generated file name, so the browser saves the file instead of playing it.
function startDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// The "Responses" block on the request details page (real data from the API).
export default function ResponsesSection({ requestId, responseCount }) {
  const list = useResponses(requestId);
  const toast = useToast();
  const [playing, setPlaying] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const total = responseCount;
  const batches = [...new Map(list.responses.filter(r=>r.batchId).map(r=>[r.batchId,r])).values()];

  // A fresh signed URL is requested for every download; it is used immediately and never stored.
  const handleDownload = useCallback(
    async (response) => {
      if (downloadingId) return;
      setDownloadingId(response.id);
      try {
        const result = await getDownload(response.id);
        startDownload(result.kind === 'signed' ? result.url : apiUrl(result.path));
        toast.success('Your download is starting.');
      } catch (err) {
        toast.error(describeVideoAccessError(err).message);
        // The status may have changed (expired / removed): refresh the list.
        if (['VIDEO_EXPIRED', 'VIDEO_MISSING'].includes(err?.response?.data?.code)) list.reload();
      } finally {
        setDownloadingId('');
      }
    },
    [downloadingId, list, toast]
  );

  return (
    <Box component="section" aria-labelledby="responses-heading">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography id="responses-heading" variant="h6" component="h2">
          Responses
        </Typography>
        <Chip size="small" label={total} />
      </Box>

      {list.status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={list.reload}>Try again</Button>}>
          {list.error}
        </Alert>
      )}

      {list.status === 'loading' && list.responses.length === 0 && <LoadingSkeleton variant="rows" count={2} label="Loading responses" />}

      {list.status === 'ready' && list.responses.length === 0 && (
        <Box sx={{ border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: 4, bgcolor: 'background.paper' }}>
          <EmptyState
            icon={<VideoLibraryRoundedIcon />}
            title="No responses yet"
            description="Once your client submits their video it will show up here, ready to play or download."
          />
        </Box>
      )}

      {batches.map(response => <Box key={response.batchId} sx={{mb:2,display:'flex',gap:2,alignItems:'center',flexWrap:'wrap'}}>
        <Typography fontWeight={600}>{response.clientName} - all question videos</Typography>
        <Button variant="outlined" component="a" href={submissionZipUrl(requestId,response.batchId)}>Download ZIP</Button>
      </Box>)}
      {list.responses.length > 0 && (
        <Box component="ul" aria-label="Client responses" sx={{ m: 0, p: 0, display: 'grid', gap: 1.5, opacity: list.status === 'loading' ? 0.6 : 1, transition: 'opacity 150ms' }}>
          {list.responses.map((response, index) => (
            <ResponseCard
              key={response.id}
              response={response}
              index={index}
              onPlay={setPlaying}
              onDownload={handleDownload}
              downloading={downloadingId === response.id}
            />
          ))}
        </Box>
      )}

      {list.pagination && list.pagination.totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
          <Pagination
            count={list.pagination.totalPages}
            page={list.page}
            onChange={(e, value) => list.setPage(value)}
            disabled={list.status === 'loading'}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        Videos are kept for {RETENTION_DAYS} days after submission, then removed automatically. The name, email and dates are kept as a record. Play and
        download links are private and last 60 seconds.
      </Typography>

      <VideoPlayerDialog open={Boolean(playing)} response={playing} onClose={() => setPlaying(null)} onDownload={handleDownload} />
    </Box>
  );
}
