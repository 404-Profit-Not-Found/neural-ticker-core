import { useEffect, useState } from 'react';
import { SuperLoading } from '../ui/SuperLoading';

/** A prefetched route chunk resolves within a few frames: show nothing for that long. */
const SHOW_AFTER_MS = 180;

/**
 * Shown while a route chunk is loading. Most navigations never see it — the
 * chunk is prefetched on intent and resolves at once — so it stays empty for
 * a moment rather than flashing. When loading really takes time, it is the
 * loading screen (wordmark, candles), not a grid of grey blocks that looks
 * like no page in particular.
 */
export function PageFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) {
    // Holds the page's footprint so the shell does not jump.
    return <div role="status" aria-live="polite" aria-label="Loading page" className={fullScreen ? 'min-h-dvh' : 'min-h-page'} />;
  }
  return <SuperLoading text="Loading" fullScreen={fullScreen} />;
}
