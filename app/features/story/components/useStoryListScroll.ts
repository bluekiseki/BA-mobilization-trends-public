import { useEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router';

const positions = new Map<string, number>();

// Client-only routes finish mounting after the router's own scroll restoration.
export function useStoryListScroll(ready: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (!ready) return;
    const saved = positions.get(location.key);
    const frame = requestAnimationFrame(() => {
      const selected = new URLSearchParams(location.search).get('focus');
      if (navigationType === NavigationType.Pop && saved !== undefined) window.scrollTo(0, saved);
      else if (location.hash && selected) document.getElementById(`series-${selected}`)?.scrollIntoView({ block: 'start' });
    });
    const remember = () => positions.set(location.key, window.scrollY);
    if (saved === undefined) remember();
    window.addEventListener('scroll', remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', remember);
    };
  }, [ready, location.key, location.hash, location.search, navigationType]);
}
