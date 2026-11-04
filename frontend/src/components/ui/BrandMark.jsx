import { Box, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import { APP_NAME } from '../../constants.js';
import { tokens } from '../../tokens.js';

// The product logo: a rounded square with a camera glyph (drawn with MUI icons, no external artwork) and the name.
export default function BrandMark({ size = 36, showName = true, light = false, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, ...sx }}>
      <Box
        aria-hidden="true"
        sx={{
          width: size,
          height: size,
          borderRadius: `${Math.round(size * 0.3)}px`,
          bgcolor: light ? '#fff' : 'primary.main',
          color: light ? 'primary.main' : '#fff',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          boxShadow: light ? 'none' : '0 4px 10px rgba(99, 91, 255, 0.3)',
        }}
      >
        <VideocamRoundedIcon sx={{ fontSize: size * 0.58 }} />
      </Box>
      {showName && (
        <Typography
          variant="subtitle1"
          noWrap
          sx={{ fontWeight: 700, letterSpacing: '-0.01em', color: light ? '#fff' : tokens.color.text }}
        >
          {APP_NAME}
        </Typography>
      )}
    </Box>
  );
}
