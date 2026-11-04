import { useEffect, useMemo, useSyncExternalStore } from 'react';
import RecorderController from '../services/RecorderController.js';

// The recorder is split in two so the one-second timer does not re-render the whole page (or the <video> elements):
//
//   useRecorderController()          creates ONE controller for the page and switches the camera off when the page goes
//   useRecorderValue(c, selector)    subscribes a component to ONE field, e.g. (s) => s.status or (s) => s.elapsedSeconds.
//                                    The component re-renders only when that field changes.
//
// Selectors must return a primitive or a stable reference (blob, stream, error): never build a new object inside them.

export function useRecorderController() {
  const controller = useMemo(() => new RecorderController(), []);

  useEffect(() => {
    // Also stop when the page is hidden for good (tab closed / navigated away), which unmount does not always cover.
    const onPageHide = () => controller.release();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      controller.release();
    };
  }, [controller]);

  return controller;
}

export function useRecorderValue(controller, selector) {
  return useSyncExternalStore(controller.subscribe, () => selector(controller.getSnapshot()));
}

// Ready-made selectors (module-level, so they are stable).
export const select = {
  status: (s) => s.status,
  error: (s) => s.error,
  notice: (s) => s.notice,
  stream: (s) => s.stream,
  blob: (s) => s.blob,
  mimeType: (s) => s.mimeType,
  durationSeconds: (s) => s.durationSeconds,
  elapsedSeconds: (s) => s.elapsedSeconds,
};
