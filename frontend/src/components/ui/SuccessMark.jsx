import { Box } from '@mui/material';
import { drawStroke, popIn } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

// An animated check mark: the circle fades in, then the circle outline and the tick are drawn.
// Under prefers-reduced-motion the global rule makes it appear instantly. Decorative: the text next to it carries the meaning.
export default function SuccessMark({ size = 88 }) {
  const circleLength = 2 * Math.PI * 28;
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: tokens.color.successSoft,
        display: 'grid',
        placeItems: 'center',
        animation: `${popIn} 380ms ${tokens.motion.easing} both`,
      }}
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 64 64" fill="none">
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke={tokens.color.success}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circleLength}
          strokeDashoffset={circleLength}
          style={{ animation: `${drawStroke} 520ms ${tokens.motion.easing} 120ms forwards` }}
        />
        <path
          d="M20 33.5l8.5 8.5L44.5 24"
          stroke={tokens.color.success}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="40"
          strokeDashoffset="40"
          style={{ animation: `${drawStroke} 360ms ${tokens.motion.easing} 520ms forwards` }}
        />
      </svg>
    </Box>
  );
}
