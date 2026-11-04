import { memo, useEffect, useRef } from 'react';

// The live camera preview. It is memoised and only receives the stream, so the one-second recording timer (which
// updates other components) never re-renders it. The stream is attached to the element through a ref and detached
// on cleanup; the camera tracks themselves are stopped by the RecorderController, not here.
// `muted` stops the client hearing an echo; the preview is mirrored like a mirror, but the saved video is not.
function LiveVideo({ stream }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    video.srcObject = stream || null;
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Live camera preview"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)', background: '#0F1424' }}
    />
  );
}

export default memo(LiveVideo);
