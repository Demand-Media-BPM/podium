import it from './it-tech-pulse.js';
import fin from './fin-tech-pulse.js';
import mar from './mar-tech-pulse.js';
import hr from './hr-tech-pulse.js';
import health from './health-tech-pulse.js';
import { createTheme, alpha, getContrastRatio } from '@mui/material/styles';
import base from '../../theme.js';
export const MICROSITES = [it, fin, mar, hr, health];
export const getMicrosite = id => MICROSITES.find(site => site.id === id);
const contrast = color => getContrastRatio(color, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#172033';
export function createMicrositeTheme(id) {
  const site = getMicrosite(id);
  if (!site) return base;
  const accent = getContrastRatio(site.primary, '#FFFFFF') >= 3 ? site.primary : site.secondary;
  return createTheme(base, {
    palette: {
      primary: {main: site.primary, light: alpha(site.secondary, 0.14), contrastText: contrast(site.primary)},
      secondary: {main: site.secondary, contrastText: contrast(site.secondary)},
      info: {main: accent,light: alpha(site.secondary,0.12)},
      action: {selected: alpha(site.secondary,0.12),hover: alpha(site.secondary,0.06)},
      background: {default: alpha(site.secondary, 0.05), paper: '#FFFFFF'},
    },
    components: {
      MuiButton: {styleOverrides: {containedPrimary: {'&:hover': {backgroundColor: site.primary, filter: 'brightness(0.92)'}}, textPrimary: {color: accent}, outlinedPrimary: {color: accent, borderColor: accent}}},
      MuiOutlinedInput: {styleOverrides: {root: {'&.Mui-focused .MuiOutlinedInput-notchedOutline': {borderColor: accent}}}},
      MuiInputLabel: {styleOverrides: {root: {'&.Mui-focused': {color: accent}}}},
      MuiButtonBase: {styleOverrides: {root: {'&.Mui-focusVisible': {outline: '2px solid ' + accent}}}},
      MuiLinearProgress: {defaultProps: {color: 'secondary'}},
      MuiCircularProgress: {defaultProps: {color: 'secondary'}},
      MuiCheckbox: {styleOverrides: {root: {'&.Mui-checked': {color: accent}}}},
      MuiAccordion: {styleOverrides: {root: {border: '1px solid ' + alpha(site.secondary, 0.3), '&:before': {display: 'none'}}}},
    },
  });
}
