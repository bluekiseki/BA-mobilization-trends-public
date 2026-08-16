import { useState, useRef, useEffect } from 'react';
import type { Student } from '~/types/data';
import { getCharacterStarValue, Transparent_Image, type Character, type PortraitData } from './common';
import { StarRating } from '../StarRating';
import React from 'react';

export const StudentIcon: React.FC<{
  character?: Character;
  student?: Student;
  portraitData: PortraitData;
  grayscale?: boolean;
  teamMemberCount?: 6 | 10;
  size?: 'default' | 'responsive';
}> = React.memo(({ character, student, portraitData, grayscale = false, teamMemberCount = 6, size = 'default' }) => {
  const imageUrl = character ? (portraitData[character?.id] ? `data:image/webp;base64,${portraitData[character?.id]}` : null) : null;
  const isBackHalfMulligan = typeof character?.mulliganIndex === 'number' && character.mulliganIndex >= (teamMemberCount === 10 ? 5 : 3);
  const isFrontHalfMulligan = character?.isMulligan || (typeof character?.mulliganIndex === 'number' && character.mulliganIndex >= 0 && character.mulliganIndex < (teamMemberCount === 10 ? 5 : 3));
  const outerSizeClassName = size === 'responsive' ? 'basis-12 min-w-12 sm:basis-14 sm:min-w-10 xl:basis-16 xl:min-w-16' : 'basis-14 min-w-10';
  const innerSizeClassName = size === 'responsive' ? 'max-w-12 max-h-12 sm:max-w-14 sm:max-h-14 xl:max-w-16 xl:max-h-16' : 'max-w-14 max-h-14';

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
      className={`relative w-full flex flex-col items-center grow-0 shrink rounded-sm ${outerSizeClassName}`}
      // onClick={() => setShowTooltip(!showTooltip)}
      onMouseEnter={() => setShowTooltip(true)}
      onFocus={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onBlur={() => setShowTooltip(false)}
    >
      <div
        className={`relative w-full aspect-square rounded-sm ${innerSizeClassName} ${
          isBackHalfMulligan
            ? 'ring-2 dark:ring-1 ring-blue-400 dark:ring-[#71fdff]'
            : isFrontHalfMulligan
              ? 'ring-2 dark:ring-1 ring-yellow-500 dark:ring-yellow-200'
              : 'border-0 border-neutral-400 dark:border-neutral-500'
        } z-5 overflow-hidden ${grayscale ? 'grayscale opacity-50' : ''}`}
        style={{}}
      >
        <img src={imageUrl ? imageUrl : Transparent_Image} alt={student?.Name} className="w-full h-full mb-0.5 rounded-sm bg-neutral-50 dark:bg-neutral-700" />
        <div
          className="h-1 w-full absolute bottom-0 "
          style={{
            backgroundColor: {
              Explosion: '#b62915',
              Pierce: '#bc8800',
              Mystic: '#206d9b',
              Sonic: '#9a46a8',
              Chemical: '#137973',
              '-': '#00000000',
            }[student?.BulletType || '-'],
          }}
        ></div>
        {character && character.star && (
          <div className="absolute bottom-0 left-0">
            <StarRating n={getCharacterStarValue(character)} />
          </div>
        )}
        {character && character.level && (
          <div
            className="absolute top-0 left-0.5 text-xs font-medium text-white italic"
            style={{
              textShadow: `
                        +0.7px 0 #444,
                        -0.7px 0 #444,
                        +0 +0.7px #444,
                        +0 -0.7px #444,
                        +0.5px +0.5px #444,
                        -0.5px -0.5px #444,
                        +0.5px -0.5px #444,
                        -0.5px +0.5px #444,
                        0 0 1px #000
                        `,
            }}
          >
            Lv.{character.level}
          </div>
        )}
        {character && typeof character.CombatStyleIndex == 'number' && (
          <div className="absolute -bottom-0.5 right-0 flex items-center">
            <div className="h-3.5 w-2.5 bg-white text-black text-[0.6em] flex justify-center items-center font-bold italic">{character.CombatStyleIndex + 1}</div>
            <div className="text-yellow-600 flex justify-center items-center">⤸</div>
          </div>
        )}
      </div>

      {character && typeof character.mulliganIndex === 'number' && (
        <div
          className="absolute z-5 font-bold"
          style={{
            top: '-2px',
            right: '-2px',
            fontSize: '10px',
            lineHeight: 1,
            padding: '2px 2.5px',
            borderRadius: '2px',
            color: isBackHalfMulligan ? '#153f5b' : '#80522d',
            backgroundColor: isBackHalfMulligan ? '#5cc8fa' : '#fff26a',
            border: `1px solid ${isBackHalfMulligan ? '#377dcf' : '#ec9c4e'}`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
          }}
        >
          {character.mulliganIndex + 1}
        </div>
      )}
      {showTooltip && student?.Name && (
        <div className="absolute bottom-full left-1/2 z-100 mb-2 w-max -translate-x-1/2 rounded bg-neutral-800 px-2 py-1 text-xs text-white dark:bg-black">
          {student.Name}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-neutral-800 dark:border-t-black"></div>
        </div>
      )}
    </div>
  );
});
