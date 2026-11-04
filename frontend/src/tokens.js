// Central design tokens. Components read colours/radii/motion from the MUI theme (theme.js builds it from these) or
// from `tokens` directly for the few custom values the theme has no slot for. Change the look here.
export const tokens = {
  color: {
    primary: '#635BFF',
    primaryHover: '#5148E5',
    primarySoft: '#EFEEFF',
    bg: '#F7F8FC',
    card: '#FFFFFF',
    text: '#172033',
    textMuted: '#656C7B',
    border: '#E7E9F0',
    borderStrong: '#CBD0DC',
    success: '#16A34A',
    successText: '#15803D', // darker green: the main green is too light for small text on white
    successSoft: '#DCFCE7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    warning: '#B45309',
    warningSoft: '#FEF3C7',
    neutralSoft: '#EEF0F5',
    dark: '#0F1424',
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 20 },
  shadow: {
    card: '0 1px 2px rgba(23, 32, 51, 0.04), 0 1px 3px rgba(23, 32, 51, 0.05)',
    raised: '0 6px 16px rgba(23, 32, 51, 0.09)',
    overlay: '0 16px 40px rgba(23, 32, 51, 0.16)',
  },
  motion: { fast: 150, base: 220, slow: 300, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
};
