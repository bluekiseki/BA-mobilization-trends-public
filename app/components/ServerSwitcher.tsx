// src/components/RegionSwitcher.tsx

import { useLocation, useNavigate } from 'react-router';
import { GAMESERVER_LIST, type GameServer } from '~/types/data';

/**
 * A toggle switch for changing regions (JP/KR) on specific routes.
 * It only appears on paths like /charts/kr/ranking or /dashboard/jp/...
 */
export default function ServerSwitcher() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // This regex specifically targets the required URL structures.
  // It finds 'jp' or 'kr' only if it follows '/charts' or '/dashboard'.
  const regionMatch = pathname.match(/^(|\/ko|\/ja|\/zh\-Hant)\/(charts|dashboard)\/(jp|kr)/);
  const currentServer = regionMatch ? (regionMatch[3] as GameServer) : null;

  // Handler to construct the new path and navigate
  const handleRegionChange = (newRegion: GameServer) => {
    if (currentServer && newRegion !== currentServer) {
      // Replaces the first occurrence of the GameServer code in the path
      let newPathname = '';

      if (pathname.match(/^(|\/ko|\/ja|\/zh\-Hant)\/dashboard\//)) {
        // newPathname = `/dashboard/${newRegion}`;
        newPathname = pathname.replace(`/${currentServer}`, `/${newRegion}`);
      } else if (pathname.match(/^(|\/ko|\/ja|\/zh\-Hant)\/charts/)) {
        newPathname = pathname.replace(`/${currentServer}`, `/${newRegion}`);
      }

      if (newPathname) {
        navigate(newPathname);
      }
    }
  };

  // If the current path doesn't match our criteria, render nothing.
  if (!currentServer) {
    return null;
  }

  // The UI for the switcher, styled with Tailwind CSS
  return (
    <div className="flex items-center space-x-1 p-1 rounded-full bg-neutral-200 dark:bg-neutral-700 shadow-inner">
      {GAMESERVER_LIST.map((GameServer) => (
        <button
          key={GameServer}
          onClick={() => handleRegionChange(GameServer)}
          aria-label={`Switch to ${GameServer.toUpperCase()} GameServer`}
          className={`px-3 py-1.5 text-sm font-bold rounded-full transition-colors duration-200 ${
            currentServer === GameServer
              ? 'bg-bluearchive-botton-blue text-black shadow-md' // Active style
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600 cursor-pointer select-none' // Inactive style
          }`}
        >
          {GameServer.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
