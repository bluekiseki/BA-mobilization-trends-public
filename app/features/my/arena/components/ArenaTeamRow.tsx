import type { ReactNode } from 'react';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import { LuShield, LuSword } from 'react-icons/lu';
import type { PortraitData } from '~/types/raidReport';
import type { Student } from '~/types/plannerData';
import type { ArenaTeam } from '~/features/my/arena/types';
import { teamSlots } from '~/features/my/arena/scan/records';

export const LOW_CONFIDENCE = 0.6;

interface Props {
  team: ArenaTeam;
  // Recognition scores in display order (strikers, then specials); low ones are outlined for review.
  scores?: number[];
  students: Record<string, Student>;
  portraitData: PortraitData;
  onPick?: (index: number) => void;
  onDamageChange?: (index: number, damage: number | null) => void;
  // Matchup summaries aggregate several battles, so one battle's damage would be misleading there.
  hideDamage?: boolean;
}

// Plain portrait: the combat report has no star/weapon info, so StudentIcon's overlays would show wrong values.
export function StudentPortrait({ id, portraitData, name, className = '' }: { id: number; portraitData: PortraitData; name?: string; className?: string }) {
  const src = portraitData[id];
  return src ? (
    <img src={`data:image/webp;base64,${src}`} alt={name ?? ''} title={name} className={`aspect-square w-full object-cover ${className}`} />
  ) : (
    <div title={name} className={`aspect-square w-full bg-neutral-200 dark:bg-neutral-800 ${className}`} />
  );
}

const formatDamage = (damage: number | null) => (damage === null ? '-' : damage.toLocaleString());

export function ArenaTeamRow({ team, scores, students, portraitData, onPick, onDamageChange, hideDamage = false }: Props) {
  const slots = teamSlots(team);
  return (
    <div className="flex items-start gap-1">
      {slots.map((slot, index) => {
        const student = students[String(slot.id)];
        const score = scores?.[index];
        const low = score !== undefined && score < LOW_CONFIDENCE;
        const icon = <StudentPortrait id={slot.id} portraitData={portraitData} name={student?.Name} />;
        return (
          <div key={index} className={`flex min-w-10 max-w-14 flex-1 basis-14 flex-col items-center ${slot.role === 'special' && slots[index - 1]?.role === 'striker' ? 'ml-2' : ''}`}>
            {onPick ? (
              <button type="button" onClick={() => onPick(index)} title={low ? 'Check recognition' : student?.Name} className={`w-full ${low ? 'outline-2 outline-amber-500' : ''}`}>
                {icon}
              </button>
            ) : (
              <div className="w-full">{icon}</div>
            )}
            {hideDamage ? null : onDamageChange ? (
              <input
                inputMode="numeric"
                value={slot.damage ?? ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  onDamageChange(index, digits === '' ? null : Number(digits));
                }}
                className="mt-0.5 w-full border-b border-neutral-300 bg-transparent text-center text-[11px] tabular-nums text-neutral-700 outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-300"
              />
            ) : (
              <span className="mt-0.5 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">{formatDamage(slot.damage)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Attack/defense mark, same sword/shield convention as the in-game combat report.
export function RoleIcon({ role, className = 'h-4 w-4' }: { role: 'attack' | 'defense'; className?: string }) {
  const Icon = role === 'attack' ? LuSword : LuShield;
  return <Icon className={`shrink-0 text-neutral-700 dark:text-neutral-200 ${className}`} title={role === 'attack' ? 'Attack' : 'Defense'} aria-label={role === 'attack' ? 'Attack' : 'Defense'} />;
}

// Per-team result in the in-game colors: "Win" yellow, "Lose" gray. Attached to the team, not the row, so the winner
// is visible whichever column it sits in.
export function ResultBadge({ won }: { won: boolean }) {
  return (
    <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold leading-none ${won ? 'bg-ba-btn-yellow text-neutral-900' : 'bg-neutral-500 text-white dark:bg-neutral-500'}`}>
      {won ? 'WIN' : 'LOSE'}
    </span>
  );
}

// Row background for battles I won (lost battles stay plain). Negative margin widens the tint without shifting content,
// so tinted and plain rows stay aligned.
export const wonRowTint = (won: boolean) => (won ? '-mx-2 px-2 bg-neutral-200/70 dark:bg-neutral-800/70' : '');

// Header above a team row: role icon, optional result, whose team it is, and a search button that runs the search on
// exactly this team (its side and role).
export function TeamHeader({
  role,
  won,
  side,
  name,
  onSearch,
  children,
}: {
  role?: 'attack' | 'defense';
  won?: boolean;
  side?: 'me' | 'opponent';
  // Opponent identity (avatar + nickname); "ME" is shown for my side.
  name?: ReactNode;
  onSearch?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-1 flex min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
      {role && <RoleIcon role={role} />}
      {won !== undefined && <ResultBadge won={won} />}
      {side === 'me' && <span className="shrink-0 border border-blue-500 px-1 text-[11px] font-bold leading-4 text-blue-600 dark:text-blue-400">ME</span>}
      {side === 'opponent' && (name ?? <span className="shrink-0">Opponent</span>)}
      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          aria-label={`Search with this ${side === 'me' ? 'my' : 'opponent'} ${role ?? ''} team`.replace(/\s+/g, ' ').trim()}
          title="Search with this team"
          className="shrink-0 p-0.5 text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          <HiOutlineMagnifyingGlass className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}
