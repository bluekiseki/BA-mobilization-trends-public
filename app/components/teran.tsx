// The self-made asset to avoid copyright

import { useEffect, useRef, useState } from 'react';
const indoorIcon = (
  <svg viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
    <path stroke="currentColor" fill="none" strokeWidth="18px" d="M 62.412 170.828 L 175.115 91.245 L 284.851 167.862"></path>
    <path strokeMiterlimit="3" fill="none" stroke="currentColor" strokeWidth="18px" d="M 220.435 209.979 L 127.371 209.979"></path>
    <path strokeMiterlimit="3" fill="none" stroke="currentColor" strokeWidth="18px" d="M 148.806 256.73 L 148.806 208.915"></path>
    <path strokeMiterlimit="3" fill="none" stroke="currentColor" strokeWidth="18px" d="M 201.602 210.044 L 201.602 255.303"></path>
    <path strokeMiterlimit="3" fill="none" stroke="currentColor" strokeWidth="18px" d="M 194.192 163.049 L 151.248 163.049"></path>
    <path strokeMiterlimit="3" fill="none" stroke="currentColor" strokeWidth="18px" d="M 246.988 140.511 L 246.988 252.635 L 107.125 252.635 L 107.125 135.255"></path>
  </svg>
);

const streetIcon = (
  <svg viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
    <defs></defs>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 189 190 L 189 165"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 189 142 L 189 115"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 158 115 L 158 142"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 158 165 L 158 190"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 90.497 188.435 L 90.497 164.046"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 126.343 255.891 L 126.343 92.639 L 222.109 92.639 L 222.109 252.633"></path>
    <path fill="none" stroke="currentColor" strokeWidth="18px" d="M 226.096 193.138 L 289.214 193.138 L 289.214 253.06 L 59.789 253.06 L 59.789 148.452 L 124.557 148.452"></path>
  </svg>
);

const outdoorIcon = (
  <svg viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
    <path stroke="currentColor" fill="none" strokeWidth="14px" d="M 121.879 207.413 L 87.32 207.413"></path>
    <path stroke="currentColor" fill="none" strokeWidth="15px" d="M 180.084 243.486 L 231.318 170.637 L 282.018 244.286 L 65.449 243.939 L 148.65 120.391 L 208.69 203.379"></path>
    <path fill="none" stroke="currentColor" strokeWidth="14px" d="M 150.251 172.692 L 112.892 172.692"></path>
    <ellipse stroke="currentColor" fill="none" strokeWidth="14px" cx="206.555" cy="108.383" rx="18.412" ry="18.412"></ellipse>
  </svg>
);

export type Terrain = 'Indoor' | 'Outdoor' | 'Street';

export const TerrainIcon = ({ terrain }: { terrain: Terrain }) => {
  if (['Indoor', '실내', '屋内', '室內'].includes(terrain)) return indoorIcon;
  if (['Outdoor', '야외', '屋外', '室外'].includes(terrain)) return outdoorIcon;
  return streetIcon;
};

export const TerrainIconGameStyle = ({ terrain, size }: { terrain: Terrain; size: string }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref]);

  return (
    <div
      ref={ref}
      style={{ height: size, width: size }}
      className="relative bg-[#00acff] text-white rounded-[0.1em] inline-block focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
      onClick={() => setShowTooltip(!showTooltip)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      aria-describedby={`tooltip-for-${terrain}`}
    >
      <TerrainIcon terrain={terrain} />
      <div
        id={`tooltip-for-${terrain}`}
        role="tooltip"
        className={`
                    absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2
                    rounded bg-neutral-800 px-2 py-1 text-xs text-white shadow-lg
                    transition-all duration-200 ease-in-out dark:bg-black
                    ${showTooltip ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
                `}
      >
        {terrain}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-neutral-800 dark:border-t-black"></div>
      </div>
    </div>
  );
};
