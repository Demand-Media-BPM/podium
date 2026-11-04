import { useCallback, useEffect, useMemo, useState } from 'react';
import Countdown from '../services/Countdown.js';

// React wrapper for the countdown. `value` is the number being shown (3, 2, 1) or null when no countdown is running.
// It is cancelled automatically when the component unmounts.
export default function useCountdown(seconds = 3) {
  const countdown = useMemo(() => new Countdown({ seconds }), [seconds]);
  const [value, setValue] = useState(null);

  useEffect(() => () => countdown.cancel(), [countdown]);

  const start = useCallback(
    (onDone) =>
      countdown.start({
        onTick: setValue,
        onDone: () => {
          setValue(null);
          onDone();
        },
      }),
    [countdown]
  );

  const cancel = useCallback(() => {
    countdown.cancel();
    setValue(null);
  }, [countdown]);

  return { value, active: value !== null, start, cancel };
}
