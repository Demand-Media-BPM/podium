import { useState } from 'react';
import { Box, Button, IconButton, Paper, TextField, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { QUESTION_MAX } from '../../constants.js';
export default function QuestionEditor({questions = [], onChange, error, disabled}) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const add = () => {
    const text = draft.trim();
    if (!text || text.length > QUESTION_MAX) {setDraftError('Enter a question of up to ' + QUESTION_MAX + ' characters'); return;}
    if (questions.length >= 30) {setDraftError('You can add up to 30 questions'); return;}
    onChange([...questions, {text}]); setDraft(''); setDraftError('');
  };
  return <Box sx={{display:'grid', gap:1.5}}>
    <Box sx={{display:'flex', gap:1, alignItems:'flex-start'}}>
      <TextField label="Add your question" value={draft} onChange={e => {setDraft(e.target.value);setDraftError('');}} multiline minRows={2} fullWidth disabled={disabled} error={Boolean(error || draftError)} helperText={error || draftError || 'Add each question separately. All questions require a video answer.'} slotProps={{htmlInput:{maxLength:QUESTION_MAX}}} />
      <Button variant="contained" onClick={add} disabled={disabled} sx={{mt:1}}>Add</Button>
    </Box>
    {questions.map((q,i) => <Paper key={q.id || i} variant="outlined" sx={{p:2, pr:6, position:'relative'}}>
      <Typography variant="overline">Question {i+1}</Typography>
      <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{q.text}</Typography>
      <IconButton aria-label={'Remove question ' + (i+1)} onClick={() => onChange(questions.filter((_,index)=>index!==i))} disabled={disabled} size="small" sx={{position:'absolute',right:8,top:8}}><CloseRoundedIcon fontSize="small" /></IconButton>
    </Paper>)}
    {Boolean(draft.trim()) && <Typography variant="caption" color="text.secondary">Click Add to include the question you are typing.</Typography>}
  </Box>;
}
