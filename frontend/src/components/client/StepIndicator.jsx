import { Box, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { STAGE_LABELS, STAGES, stageIndex } from '../../utils/clientStage.js';
import { tokens } from '../../tokens.js';

// "Details > Record > Review > Submit". Purely informational: the current step comes from the real state of the flow.
export default function StepIndicator({ stage }) {
  const current = stageIndex(stage);
  return (
    <Box
      component="ol"
      aria-label={`Step ${current + 1} of ${STAGES.length}: ${STAGE_LABELS[stage]}`}
      sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, sm: 1.25 }, listStyle: 'none', m: 0, p: 0, flexWrap: 'wrap' }}
    >
      {STAGES.map((key, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <Box component="li" key={key} aria-current={active ? 'step' : undefined} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              aria-hidden="true"
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                bgcolor: done ? tokens.color.success : active ? 'primary.main' : tokens.color.neutralSoft,
                color: done || active ? '#fff' : tokens.color.textMuted,
                transition: `background-color ${tokens.motion.base}ms`,
              }}
            >
              {done ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : index + 1}
            </Box>
            <Typography
              variant="caption"
              sx={{ fontWeight: active ? 700 : 500, color: active ? 'text.primary' : 'text.secondary', display: { xs: active ? 'block' : 'none', sm: 'block' } }}
            >
              {STAGE_LABELS[key]}
            </Typography>
            {index < STAGES.length - 1 && <Box aria-hidden="true" sx={{ width: { xs: 10, sm: 18 }, height: 2, bgcolor: done ? tokens.color.success : tokens.color.border, borderRadius: 1 }} />}
          </Box>
        );
      })}
    </Box>
  );
}
