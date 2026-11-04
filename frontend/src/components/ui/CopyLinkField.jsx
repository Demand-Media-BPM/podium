import { useEffect, useRef, useState } from 'react';
import { Box, Button, InputAdornment, TextField } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import { useToast } from './ToastProvider.jsx';

// Read-only link box with a Copy Link button. If the browser blocks clipboard access, the text is selected so the
// user can press Ctrl+C. The link itself is only ever shown here, in memory; it is never stored.
export default function CopyLinkField({ url, label = 'Public link' }) {
  const inputRef = useRef(null);
  const timer = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | copied | failed
  const toast = useToast();

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
      toast.success('Link copied to clipboard');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setStatus('failed');
      toast.error('Could not copy automatically. The link is selected: press Ctrl+C (or Cmd+C).');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 3500);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'stretch' } }}>
      <TextField
        label={label}
        value={url}
        fullWidth
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start">
                <LinkRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
          },
          htmlInput: { ref: inputRef, onFocus: (e) => e.target.select(), style: { textOverflow: 'ellipsis' } },
        }}
      />
      <Button
        variant="contained"
        color={status === 'copied' ? 'success' : 'primary'}
        startIcon={status === 'copied' ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
        onClick={handleCopy}
        sx={{ flexShrink: 0, minWidth: 148, minHeight: 56 }}
      >
        {status === 'copied' ? 'Copied' : 'Copy Link'}
      </Button>
    </Box>
  );
}
