import { Box, Skeleton } from '@mui/material';

// Placeholder blocks while real data loads. `variant`: 'rows' (a list/table), 'cards' (a grid of cards), 'page' (title + cards).
export default function LoadingSkeleton({ variant = 'rows', count = 4, label = 'Loading' }) {
  if (variant === 'cards') {
    return (
      <Box aria-busy="true" aria-label={label} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} variant="rounded" height={96} animation="wave" />
        ))}
      </Box>
    );
  }
  if (variant === 'page') {
    return (
      <Box aria-busy="true" aria-label={label} sx={{ display: 'grid', gap: 2 }}>
        <Skeleton variant="rounded" width={260} height={36} animation="wave" />
        <Skeleton variant="rounded" height={140} animation="wave" />
        <Skeleton variant="rounded" height={200} animation="wave" />
      </Box>
    );
  }
  return (
    <Box aria-busy="true" aria-label={label} sx={{ display: 'grid', gap: 1.25, p: 2.5 }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={52} animation="wave" />
      ))}
    </Box>
  );
}
