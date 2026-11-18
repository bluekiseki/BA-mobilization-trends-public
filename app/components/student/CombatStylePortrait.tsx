import { SheetIcon } from '~/components/common/SheetIcon';
import { getCombatStyleGroupRosterIds } from '~/utils/combatStyle';

interface CombatStylePortraitProps {
  studentId: number;
  alt: string;
  className?: string;
  imageClassName?: string;
}

/** Renders the shared diagonal portrait used when a student has two combat styles. */
export function CombatStylePortrait({ studentId, alt, className = '', imageClassName = '' }: CombatStylePortraitProps) {
  const ids = getCombatStyleGroupRosterIds(studentId);
  const placeholder = <div className="h-full w-full bg-neutral-200 dark:bg-neutral-700" />;

  if (ids.length !== 2) return <SheetIcon sheet="student" id={ids[0]} alt={alt} className={`h-full w-full ${imageClassName}`} fallback={placeholder} />;

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`} role="img" aria-label={alt}>
      <SheetIcon sheet="student" id={ids[0]} alt="" className={`absolute left-0 top-0 h-[72%] w-[72%] [clip-path:polygon(0_0,100%_0,100%_39%,39%_100%,0_100%)] ${imageClassName}`} />
      <SheetIcon sheet="student" id={ids[1]} alt="" className={`absolute bottom-0 right-0 h-[72%] w-[72%] [clip-path:polygon(61%_0,100%_0,100%_100%,0_100%,0_61%)] ${imageClassName}`} />
      <span aria-hidden="true" className="absolute left-[-15%] top-1/2 h-px w-[130%] -rotate-45 bg-white" />
    </div>
  );
}
