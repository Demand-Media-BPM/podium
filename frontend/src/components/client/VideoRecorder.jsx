import { useCallback, useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import RecorderStage from './RecorderStage.jsx';
import RecorderControls from './RecorderControls.jsx';
import useCountdown from '../../hooks/useCountdown.js';
import { select, useRecorderValue } from '../../hooks/useRecorder.js';

// STEP B/C: camera preview, countdown and recording. `controller` is the page's RecorderController.
//
// How a recording starts:   "Start Recording" -> 3, 2, 1 -> controller.start() -> only then does the status become
// 'recording' and the red indicator appear. The countdown is cancelled if the client presses Cancel, the camera is lost,
// or the page is left, and it can never start a second recorder: the controller ignores start() unless it is 'ready'.
//
// Camera permission is requested only when the client presses the button (never on page load, and never while the
// welcome modal is open: this component is not even mounted until the modal is completed).
export default function VideoRecorder({ controller }) {
  const status = useRecorderValue(controller, select.status);
  const stream = useRecorderValue(controller, select.stream);
  const error = useRecorderValue(controller, select.error);
  const notice = useRecorderValue(controller, select.notice);
  const countdown = useCountdown(3);
  const startedRef = useRef(false);

  // If the camera goes away while counting down (permission revoked, device unplugged), stop counting.
  useEffect(() => {
    if (status !== 'ready' && countdown.active) countdown.cancel();
  }, [status, countdown]);

  const handleStart = useCallback(() => {
    if (status !== 'ready') return;
    startedRef.current = false;
    countdown.start(() => {
      // Runs once, when the last second is over. The controller double-checks that it is still 'ready'.
      if (startedRef.current) return;
      startedRef.current = true;
      controller.start();
    });
  }, [controller, countdown, status]);

  const handleStop = useCallback(() => {
    countdown.cancel();
    controller.stop('user');
  }, [controller, countdown]);

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <RecorderStage controller={controller} status={status} stream={stream} countdown={countdown} />
      <RecorderControls
        controller={controller}
        status={status}
        error={error}
        notice={notice}
        countdown={countdown}
        onStart={handleStart}
        onStop={handleStop}
        onCancelCountdown={countdown.cancel}
        onRequestAccess={() => controller.requestAccess()}
      />
    </Box>
  );
}
