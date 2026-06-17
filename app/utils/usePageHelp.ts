import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useHelpStore } from '~/store/helpStore';

export const useHelpKey = (key: string | string[], enabled = true) => {
  const setHelpKey = useHelpStore((state) => state.setHelpKey);
  const openSidebar = useHelpStore((state) => state.openSidebar);
  const setHighlightedTour = useHelpStore((state) => state.setHighlightedTour);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    setHelpKey(key);
    return () => setHelpKey(null);
  }, [key, setHelpKey, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const state = location.state as { tourKey?: string; tourIndex?: number } | null;
    if (state?.tourKey) {
      const isValidKey = Array.isArray(key) ? key.includes(state.tourKey) : key === state.tourKey;
      console.log('isValidKey', isValidKey, key);

      if (isValidKey) {
        // Open sidebar & schedule highlight after page navigation
        setTimeout(() => {
          setHighlightedTour({ key: state.tourKey || '', index: state.tourIndex || 0 });
          openSidebar();
          void navigate(location.pathname, { replace: true, state: {} });
        }, 150);
      }
    }
  }, [location.state, location.pathname, navigate, key, setHighlightedTour, openSidebar, enabled]);
};
