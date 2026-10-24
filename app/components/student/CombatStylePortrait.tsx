import { getCombatStyleGroupRosterIds } from '~/utils/combatStyle';

interface CombatStylePortraitProps {
  studentId: number;
  portraits: Record<number, string | { Portrait?: string } | undefined>;
  alt: string;
  className?: string;
  imageClassName?: string;
}

/** Renders the shared diagonal portrait used when a student has two combat styles. */
export function CombatStylePortrait({ studentId, portraits, alt, className = '', imageClassName = '' }: CombatStylePortraitProps) {
  const ids = getCombatStyleGroupRosterIds(studentId);
  const isPair = ids.length === 2;
  const portraitFor = (id: number) => {
    const value = portraits[id];
    return typeof value === 'string' ? value : value?.Portrait;
  };
  const firstPortrait = portraitFor(ids[0]);
  const secondPortrait = portraitFor(ids[1]);

  if (!isPair) {
    return firstPortrait ? (
      <img src={`data:image/webp;base64,${firstPortrait}`} alt={alt} className={`h-full w-full object-cover ${imageClassName}`} />
    ) : (
      <div className="h-full w-full bg-neutral-200 dark:bg-neutral-700" />
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`} role="img" aria-label={alt}>
      {firstPortrait && (
        <img
          src={`data:image/webp;base64,${firstPortrait}`}
          alt=""
          className={`absolute left-0 top-0 h-[72%] w-[72%] object-cover [clip-path:polygon(0_0,100%_0,100%_39%,39%_100%,0_100%)] ${imageClassName}`}
        />
      )}
      {secondPortrait && (
        <img
          src={`data:image/webp;base64,${secondPortrait}`}
          alt=""
          className={`absolute bottom-0 right-0 h-[72%] w-[72%] object-cover [clip-path:polygon(61%_0,100%_0,100%_100%,0_100%,0_61%)] ${imageClassName}`}
        />
      )}
      <span aria-hidden="true" className="absolute left-[-15%] top-1/2 h-px w-[130%] -rotate-45 bg-white" />
    </div>
  );
}
