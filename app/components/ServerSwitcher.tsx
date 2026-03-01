import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { GameServer } from '~/types/data';
import { useOutsideClick } from '~/utils/useOutsideClick';

interface ServerToggleSwitchProps {
  currentServer: GameServer;
  variant?: 'toggle' | 'dropdown';
}

export const ServerToggleSwitch = ({ currentServer, variant = 'toggle' }: ServerToggleSwitchProps) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Manage dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useOutsideClick(dropdownRef, () => {
    if (isOpen) setIsOpen(false);
  });

  const isKr = currentServer === 'kr';

  // 1. Function for toggle button
  const toggleServer = () => navigate(pathname.replace(`/${currentServer}`, isKr ? '/jp' : '/kr'));

  // 2. Function for dropdown selection
  const handleSelect = (target: GameServer) => {
    if (currentServer !== target) {
      navigate(pathname.replace(`/${currentServer}`, `/${target}`));
    }
    setIsOpen(false);
  };

  if (variant === 'dropdown') {
    return (
      <div className="relative md:pl-4 md:border-l border-slate-200 dark:border-neutral-700" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-300 dark:hover:text-white transition-colors"
        >
          {isKr ? 'KR' : 'JP'}
          <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-3 w-32 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg shadow-xl py-1 z-50 overflow-hidden">
            <button
              onClick={() => handleSelect('jp')}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${!isKr ? 'bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/50'}`}
            >
              JP Server
            </button>
            <button
              onClick={() => handleSelect('kr')}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${isKr ? 'bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white font-bold' : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/50'}`}
            >
              KR Server
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-bold ${!isKr ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-neutral-500'}`}>JP</span>
      <button onClick={toggleServer} className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200 dark:bg-neutral-700 transition-colors focus:outline-none">
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${isKr ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      <span className={`text-xs font-bold ${isKr ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-neutral-500'}`}>KR</span>
    </div>
  );
};
