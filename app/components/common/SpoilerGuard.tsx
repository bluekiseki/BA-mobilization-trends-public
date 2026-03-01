import React, { useState } from 'react';
import { FaEyeSlash } from 'react-icons/fa';

interface SpoilerGuardProps {
  isSpoiler: boolean;
  children: React.ReactNode;
  /**
   * 'blur': Reveal content on click after applying blur (default)
   * 'hide': Do not render in the DOM at all
   */
  mode?: 'blur' | 'hide';
  // Text to display on the overlay when in blur mode
  overlayText?: string;
}

export const SpoilerGuard = ({ isSpoiler, children, mode = 'blur', overlayText = 'Spoilers (click to view)' }: SpoilerGuardProps) => {
  const [isRevealed, setIsRevealed] = useState(!isSpoiler);

  // If not a spoiler or already revealed, render as is
  if (!isSpoiler || isRevealed) {
    return <>{children}</>;
  }

  // If mode is 'hide', do not render at all
  if (mode === 'hide') {
    return null;
  }

  // If mode is 'blur' (reveal on click)
  return (
    <div className="relative group/spoiler w-full h-full">
      {/* Content (blur applied and interactions disabled) */}
      <div className="w-full h-full blur-md opacity-40 pointer-events-none select-none transition-all duration-300">{children}</div>

      {/* Shield overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer bg-neutral-200/40 dark:bg-neutral-800/40 rounded-lg z-10 hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors"
        onClick={(e) => {
          e.preventDefault(); // Prevent default behavior of internal components like Link
          e.stopPropagation(); // Prevent event bubbling
          setIsRevealed(true);
        }}
      >
        <FaEyeSlash className="text-neutral-600 dark:text-neutral-400 text-2xl mb-2 drop-shadow-sm" />
        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 bg-white/90 dark:bg-neutral-900/90 px-2.5 py-1 rounded shadow-sm">{overlayText}</span>
      </div>
    </div>
  );
};
