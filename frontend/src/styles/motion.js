import { keyframes } from '@mui/material/styles';
import { tokens } from '../tokens.js';

// Small, restrained animations (150-300 ms, one easing curve). They are plain CSS, so they never touch React state
// or the camera/recorder. The global `prefers-reduced-motion` rule in theme.js shortens all of them to ~0 ms.

const { easing, base, slow } = tokens.motion;

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
`;

export const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

export const popIn = keyframes`
  0% { opacity: 0; transform: scale(0.6); }
  60% { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
`;

// Recording indicator: a gentle fade, not a flash.
export const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.82); }
`;

// Countdown number: arrives slightly large and settles.
export const countIn = keyframes`
  0% { opacity: 0; transform: scale(1.5); }
  35% { opacity: 1; }
  100% { opacity: 1; transform: scale(1); }
`;

// SVG success mark: the circle and the tick are "drawn" with stroke-dashoffset.
export const drawStroke = keyframes`
  to { stroke-dashoffset: 0; }
`;

export const enter = (delayMs = 0) => `${fadeUp} ${base}ms ${easing} ${delayMs}ms both`;
export const enterSlow = (delayMs = 0) => `${fadeUp} ${slow}ms ${easing} ${delayMs}ms both`;
export const fade = (delayMs = 0) => `${fadeIn} ${base}ms ${easing} ${delayMs}ms both`;
