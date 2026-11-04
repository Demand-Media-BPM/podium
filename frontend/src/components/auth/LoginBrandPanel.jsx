import { Box, Typography } from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import BrandMark from '../ui/BrandMark.jsx';
import { enterSlow } from '../../styles/motion.js';
import { tokens } from '../../tokens.js';

const HIGHLIGHTS = [
  { icon: <LinkRoundedIcon />, text: 'Send clients one private link. No accounts, no downloads.' },
  { icon: <VideocamRoundedIcon />, text: 'They record a short video answer right in their browser.' },
  { icon: <ShieldOutlinedIcon />, text: 'Videos stay in private storage and are removed after the retention period.' },
];

// The coloured side of the login screen (desktop only). Purely informational: no fake buttons or statistics.
export default function LoginBrandPanel() {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: 6,
        color: '#fff',
        background: `linear-gradient(160deg, ${tokens.color.primary} 0%, #4B43E0 100%)`,
      }}
    >
      <BrandMark light />
      <Box sx={{ maxWidth: 440, animation: enterSlow(80) }}>
        <Typography variant="h3" component="p" sx={{ color: '#fff', mb: 3 }}>
          Collect video answers, the easy way.
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
          {HIGHLIGHTS.map((item) => (
            <Box component="li" key={item.text} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box
                aria-hidden="true"
                sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
              >
                {item.icon}
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.92)', pt: 0.25 }}>{item.text}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
        Internal tool. Employee accounts are created by an administrator.
      </Typography>
    </Box>
  );
}
