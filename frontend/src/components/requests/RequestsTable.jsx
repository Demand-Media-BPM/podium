import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Link, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import StatusBadge from '../ui/StatusBadge.jsx';
import { formatDate } from '../../utils/format.js';
import { tokens } from '../../tokens.js';

// Titles are user-provided: they are rendered as React text children (escaped), never as HTML.
// Large screens get a table; small screens get tappable cards (a table with 5 columns does not fit a phone).
export default function RequestsTable({ requests, showOwner }) {
  const navigate = useNavigate();

  return (
    <>
      <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table aria-label="Requests">
          <TableHead>
            <TableRow>
              <TableCell>Request</TableCell>
              <TableCell>Status</TableCell>
              {showOwner && <TableCell>Created by</TableCell>}
              <TableCell align="right">Responses</TableCell>
              <TableCell>Created</TableCell>
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow
                key={request.id}
                hover
                onClick={() => navigate(`/requests/${request.id}`)}
                sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
              >
                <TableCell sx={{ maxWidth: 360, overflowWrap: 'anywhere' }}>
                  <Link
                    component={RouterLink}
                    to={`/requests/${request.id}`}
                    onClick={(e) => e.stopPropagation()}
                    underline="hover"
                    color="text.primary"
                    fontWeight={600}
                  >
                    {request.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={request.effectiveStatus} />
                </TableCell>
                {showOwner && <TableCell>{request.createdBy?.name || '-'}</TableCell>}
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {request.responseCount}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{formatDate(request.createdAt)}</TableCell>
                <TableCell>
                  <ChevronRightRoundedIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box component="ul" sx={{ display: { xs: 'grid', md: 'none' }, listStyle: 'none', m: 0, p: 1.5, gap: 1.25 }}>
        {requests.map((request) => (
          <Paper
            component="li"
            key={request.id}
            variant="outlined"
            sx={{ p: 0, borderColor: tokens.color.border, overflow: 'hidden' }}
          >
            <Link
              component={RouterLink}
              to={`/requests/${request.id}`}
              underline="none"
              color="inherit"
              sx={{ display: 'block', p: 2, '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start' }}>
                <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                  {request.title}
                </Typography>
                <StatusBadge status={request.effectiveStatus} size="small" />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {request.responseCount} {request.responseCount === 1 ? 'response' : 'responses'} · Created {formatDate(request.createdAt)}
                {showOwner && request.createdBy?.name ? ` · ${request.createdBy.name}` : ''}
              </Typography>
            </Link>
          </Paper>
        ))}
      </Box>
    </>
  );
}
