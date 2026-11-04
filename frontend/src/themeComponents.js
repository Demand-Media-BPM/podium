import { tokens } from './tokens.js';

const { color: c, radius: r, shadow: s, motion: m } = tokens;

// MUI component defaults and style overrides, kept apart from the palette/typography in theme.js.
export const components = {
  MuiCssBaseline: {
    styleOverrides: `
      body { background: ${c.bg}; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
      :focus-visible { outline: 2px solid ${c.primary}; outline-offset: 2px; }
      input:focus-visible, textarea:focus-visible { outline: none; }
      ::selection { background: ${c.primarySoft}; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
    `,
  },
  // MUI removes the browser outline on every ButtonBase (buttons, icon buttons, list items, links). Put a clear ring
  // back for keyboard users only: .Mui-focusVisible is set by MUI for keyboard focus, never for mouse clicks.
  MuiButtonBase: {
    styleOverrides: { root: { '&.Mui-focusVisible': { outline: `2px solid ${c.primary}`, outlineOffset: 2 } } },
  },
  MuiButton: {
    defaultProps: { disableElevation: true },
    styleOverrides: {
      root: {
        borderRadius: r.md - 2,
        minHeight: 40,
        transition: `background-color ${m.fast}ms, border-color ${m.fast}ms, transform ${m.fast}ms, box-shadow ${m.fast}ms`,
        '&:active:not(:disabled)': { transform: 'translateY(1px)' },
      },
      sizeLarge: { minHeight: 48, fontSize: '1rem', paddingInline: 24 },
      sizeSmall: { minHeight: 34 },
      containedPrimary: { '&:hover': { backgroundColor: c.primaryHover } },
      outlinedInherit: { borderColor: c.border, '&:hover': { borderColor: c.borderStrong, backgroundColor: c.neutralSoft } },
    },
  },
  MuiIconButton: { styleOverrides: { root: { transition: `background-color ${m.fast}ms` } } },
  MuiPaper: {
    defaultProps: { elevation: 0 },
    styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: r.lg } },
  },
  MuiPopover: { styleOverrides: { paper: { borderRadius: r.md, boxShadow: s.raised } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: r.xl, boxShadow: s.overlay } } },
  MuiBackdrop: { styleOverrides: { root: { backgroundColor: 'rgba(23, 32, 51, 0.5)' } } },
  MuiOutlinedInput: {
    styleOverrides: {
      root: {
        backgroundColor: '#FFFFFF',
        borderRadius: r.md - 2,
        '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.borderStrong },
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.primary, borderWidth: 2 },
      },
    },
  },
  MuiChip: { styleOverrides: { root: { borderRadius: r.sm, fontWeight: 600 } } },
  MuiTableCell: {
    styleOverrides: {
      root: { borderBottom: `1px solid ${c.border}` },
      head: {
        fontSize: '0.72rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: c.textMuted,
        backgroundColor: 'transparent',
      },
    },
  },
  MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: c.text, borderRadius: r.sm, fontSize: '0.8rem' } } },
  MuiAlert: { styleOverrides: { root: { borderRadius: r.md, alignItems: 'center' } } },
  MuiLinearProgress: { styleOverrides: { root: { height: 8, borderRadius: 999, backgroundColor: c.neutralSoft } } },
  MuiSkeleton: { styleOverrides: { root: { backgroundColor: c.neutralSoft, borderRadius: r.sm } } },
  MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { fontWeight: 500 } } },
  MuiDrawer: { styleOverrides: { paper: { borderRight: `1px solid ${c.border}` } } },
};
