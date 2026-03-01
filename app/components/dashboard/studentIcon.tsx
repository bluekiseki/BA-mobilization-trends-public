import { useState, useRef, useEffect } from 'react';
import type { Student } from '~/types/data';
import { getCharacterStarValue, Transparent_Image, type Character, type PortraitData } from './common';
import { StarRating } from '../StarRatingProps';

export const StudentIcon: React.FC<{
  character?: Character;
  student?: Student;
  portraitData: PortraitData;
}> = ({ character, student, portraitData }) => {
  const imageUrl = character ? (portraitData[character?.id] ? `data:image/webp;base64,${portraitData[character?.id]}` : null) : null;

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
      className="relative w-full flex flex-col items-center grow-0 shrink basis-14 min-w-10 shadow-xl/10 rounded-sm"
      // onClick={() => setShowTooltip(!showTooltip)}
      onMouseEnter={() => setShowTooltip(true)}
      onFocus={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onBlur={() => setShowTooltip(false)}
    >
      <div
        className={`relative w-full aspect-square rounded-sm max-w-14 max-h-14 ${character?.isMulligan ? 'ring-2 dark:ring-1  ring-yellow-500 dark:ring-yellow-200' : 'border-0 border-neutral-400 dark:border-neutral-500'} z-5 overflow-hidden`}
        style={{}}
      >
        <img src={imageUrl ? imageUrl : Transparent_Image} alt={student?.Name} className={`w-full h-full mb-0.5 rounded-sm bg-sky-50 dark:bg-neutral-700`} />
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

      {showTooltip && student?.Name && (
        <div className="absolute bottom-full left-1/2 z-100 mb-2 w-max -translate-x-1/2 rounded bg-neutral-800 px-2 py-1 text-xs text-white shadow-lg dark:bg-black">
          {student.Name}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-neutral-800 dark:border-t-black"></div>
        </div>
      )}
    </div>
  );
};
