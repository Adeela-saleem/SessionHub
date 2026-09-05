import { useEffect, useRef, useState } from 'react';

/**
 * Fires once when an element scrolls into view. Used to drive the pipeline
 * reveal. Falls straight to `true` when the viewer prefers reduced motion or
 * IntersectionObserver is unavailable, so content is never gated on animation.
 */
export function useInView<T extends HTMLElement>(rootMargin = '-15% 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') { setInView(true); return; }

    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect(); } },
      { rootMargin, threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
