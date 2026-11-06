import { useCallback, useState } from 'react';
import { Alert, Box, Button, Chip, Pagination, Tooltip, Typography } from '@mui/material';
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded';
import ResponseCard from './ResponseCard.jsx';
import VideoPlayerDialog from './VideoPlayerDialog.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadingSkeleton from '../ui/LoadingSkeleton.jsx';
import { useToast } from '../ui/ToastProvider.jsx';
import useResponses from '../../hooks/useResponses.js';
import { apiUrl, getDownload, submissionZipUrl } from '../../services/responseApi.js';
import { describeVideoAccessError } from '../../utils/videoAccess.js';
import { formatDateTime } from '../../utils/format.js';
import { RETENTION_DAYS } from '../../constants.js';
import { tokens } from '../../tokens.js';

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
  const total = list.pagination?.total ?? responseCount;

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

      {list.status === 'loading' && list.submissions.length === 0 && <LoadingSkeleton variant="rows" count={2} label="Loading responses" />}

      {list.status === 'ready' && list.submissions.length === 0 && (
        <Box sx={{ border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: 4, bgcolor: 'background.paper' }}>
          <EmptyState
            icon={<VideoLibraryRoundedIcon />}
            title="No responses yet"
            description="Each completed response will appear here with its videos and ZIP download."
          />
        </Box>
      )}

      <Box aria-busy={list.status === 'loading'} sx={{ opacity: list.status === 'loading' ? 0.6 : 1, transition: 'opacity 150ms' }}>
        {list.submissions.map((submission, groupIndex) => (
          <Box
            component="section"
            key={submission.id}
            aria-labelledby={'submission-' + submission.id}
            sx={{ mt: groupIndex ? 4 : 0, pt: groupIndex ? 4 : 0, borderTop: groupIndex ? 2 : 0, borderColor: 'divider' }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, flexWrap: 'wrap', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: `${tokens.radius.lg}px` }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography id={'submission-' + submission.id} variant="h6" component="h3">Response {submission.number}</Typography>
                  <Chip size="small" label={submission.videoCount + (submission.videoCount === 1 ? ' video' : ' videos')} />
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{submission.clientName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{submission.clientEmail}</Typography>
                <Typography variant="caption" color="text.secondary">Submitted {formatDateTime(submission.submittedAt)}</Typography>
              </Box>
              {submission.batchId && (
                <Tooltip title={submission.downloadable ? 'Download all videos in this response' : 'ZIP unavailable: a video has expired or is unavailable'}>
                  <span>
                    <Button variant="outlined" component="a" href={submission.downloadable ? submissionZipUrl(requestId, submission.batchId) : undefined} disabled={!submission.downloadable} aria-label={'Download ZIP for Response ' + submission.number}>Download ZIP</Button>
                  </span>
                </Tooltip>
              )}
            </Box>
            {submission.responses.length < submission.videoCount && <Alert severity="warning" sx={{ mb: 2 }}>Some video records in this response are unavailable.</Alert>}
            <Box component="ul" aria-label={'Videos for Response ' + submission.number} sx={{ m: 0, p: 0, display: 'grid', gap: 1.5 }}>
              {submission.responses.map((response, index) => (
                <ResponseCard
                  key={response.id}
                  response={response}
                  index={index}
                  questionNumber={submission.batchId ? index + 1 : undefined}
                  onPlay={setPlaying}
                  onDownload={handleDownload}
                  downloading={downloadingId === response.id}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>

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
        individual video download links are private and last 60 seconds. ZIP downloads require your signed-in session.
      </Typography>

      <VideoPlayerDialog open={Boolean(playing)} response={playing} onClose={() => setPlaying(null)} onDownload={handleDownload} />
    </Box>
  );
}
