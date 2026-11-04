import { Link as RouterLink } from 'react-router-dom';
import { Box, Breadcrumbs, Link, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { enter } from '../../styles/motion.js';

// Page title block. `crumbs` is [{ label, to? }]; the last crumb is the current page and has no link.
export default function PageHeader({ title, description, crumbs, actions, badge }) {
  return (
    <Box sx={{ mb: { xs: 2.5, md: 3.5 }, animation: enter() }}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: 16 }} />} aria-label="Breadcrumb" sx={{ mb: 1, '& li': { fontSize: '0.85rem' } }}>
          {crumbs.map((crumb, index) =>
            crumb.to && index < crumbs.length - 1 ? (
              <Link key={crumb.label} component={RouterLink} to={crumb.to} color="text.secondary">
                {crumb.label}
              </Link>
            ) : (
              <Typography key={crumb.label} variant="body2" color="text.primary" aria-current="page" noWrap sx={{ maxWidth: 260 }}>
                {crumb.label}
              </Typography>
            )
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {badge}
          </Box>
          {description && (
            <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 640 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
