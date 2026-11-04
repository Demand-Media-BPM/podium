import { createTheme } from '@mui/material/styles';
import { tokens } from './tokens.js';
import { components } from './themeComponents.js';

export { tokens };

const { color: c, radius: r, shadow: s } = tokens;

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: c.primary, dark: c.primaryHover, light: '#8F89FF', contrastText: '#FFFFFF' },
    secondary: { main: c.textMuted },
    success: { main: c.success, dark: c.successText, light: c.successSoft, contrastText: '#FFFFFF' },
    error: { main: c.danger, dark: '#B91C1C', light: c.dangerSoft, contrastText: '#FFFFFF' },
    warning: { main: '#D97706', dark: c.warning, light: c.warningSoft, contrastText: '#FFFFFF' },
    info: { main: c.primary, dark: c.primaryHover, light: c.primarySoft, contrastText: '#FFFFFF' },
    background: { default: c.bg, paper: c.card },
    text: { primary: c.text, secondary: c.textMuted },
    divider: c.border,
    action: { hover: 'rgba(23, 32, 51, 0.04)', selected: c.primarySoft },
  },
  shape: { borderRadius: r.md },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h3: { fontWeight: 700, fontSize: '2rem', lineHeight: 1.2, letterSpacing: '-0.02em' },
    h4: { fontWeight: 700, fontSize: '1.625rem', lineHeight: 1.25, letterSpacing: '-0.015em' },
    h5: { fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600, fontSize: '1.0625rem', lineHeight: 1.4 },
    subtitle1: { fontWeight: 600, lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.9rem', lineHeight: 1.55 },
    caption: { fontSize: '0.8rem', lineHeight: 1.5 },
    overline: { fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.08em', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },
  components,
});

// Soft, low shadows only (the default MUI ones are heavy).
theme.shadows[1] = s.card;
theme.shadows[2] = s.card;
theme.shadows[8] = s.raised;
theme.shadows[16] = s.overlay;
theme.shadows[24] = s.overlay;

export default theme;
