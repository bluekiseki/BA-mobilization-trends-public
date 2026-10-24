import type { PortraitData } from '~/types/raidReport';
import type { Student } from '~/types/plannerData';
import { updateTeamSlot, type ArenaDraft } from '~/features/my/arena/scan/records';
import { ArenaTeamRow, StudentPortrait, TeamHeader, wonRowTint } from './ArenaTeamRow';

export interface ReviewItem {
  key: string;
  fileName: string;
  draft: ArenaDraft;
  // Recognition scores per slot in display order (strikers, then specials).
  myScores: number[];
  opponentScores: number[];
  // Shown next to the nickname input when OCR returned nothing (e.g. Hangul nicknames).
  nicknameImage?: string;
  duplicate: boolean;
}

interface Props {
  item: ReviewItem;
  students: Record<string, Student>;
  portraitData: PortraitData;
  onChange: (item: ReviewItem) => void;
  onPick: (side: 'me' | 'opponent', index: number) => void;
  onSave: () => void;
  onDiscard: () => void;
}

// In-game result colors: "Win" is yellow, "Lose" is gray.
export function ArenaReviewItem({ item, students, portraitData, onChange, onPick, onSave, onDiscard }: Props) {
  const { draft } = item;
  const setDamage = (side: 'me' | 'opponent', index: number, damage: number | null) => {
    onChange({ ...item, draft: { ...draft, [side]: updateTeamSlot(draft[side], index, { damage }) } });
  };
  const avatarId = draft.opponent.avatarId;
  // Same attack | defense columns as the record list; the row tint and my team's badge carry my result.
  const attackSide: 'me' | 'opponent' = draft.role === 'attack' ? 'me' : 'opponent';
  const columns = [
    { role: 'attack' as const, side: attackSide },
    { role: 'defense' as const, side: attackSide === 'me' ? ('opponent' as const) : ('me' as const) },
  ];

  const opponentName = (
    <span className="flex min-w-0 items-center gap-1">
      {avatarId !== null && (
        <span className="w-5 shrink-0">
          <StudentPortrait id={avatarId} portraitData={portraitData} name={students[String(avatarId)]?.Name} />
        </span>
      )}
      <input
        value={draft.opponent.nickname}
        placeholder="Opponent nickname"
        onChange={(e) => onChange({ ...item, draft: { ...draft, opponent: { ...draft.opponent, nickname: e.target.value } } })}
        className="w-32 min-w-0 border-b border-neutral-300 bg-transparent px-1 py-0.5 text-xs text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100"
      />
      {item.nicknameImage && !draft.opponent.nickname && <img src={item.nicknameImage} alt="" className="h-5 min-w-0" />}
    </span>
  );

  return (
    <div className={`border-t border-neutral-200 py-3 first:border-t-0 dark:border-neutral-800 ${wonRowTint(draft.won)}`}>
      <p className="mb-1 truncate text-right text-xs text-neutral-400" title={item.fileName}>
        {item.fileName}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-6">
        {columns.map(({ role, side }) => (
          <div key={role} className="min-w-0">
            <TeamHeader role={role} won={side === 'me' ? draft.won : undefined} side={side} name={opponentName} />
            <ArenaTeamRow
              team={draft[side]}
              scores={side === 'me' ? item.myScores : item.opponentScores}
              students={students}
              portraitData={portraitData}
              onPick={(i) => onPick(side, i)}
              onDamageChange={(i, d) => setDamage(side, i, d)}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {item.duplicate && <span className="text-xs text-amber-600 dark:text-amber-400">Already saved</span>}
        <button type="button" onClick={onDiscard} className="px-3 py-1 text-xs font-semibold text-neutral-900 hover:opacity-90" style={{ backgroundColor: 'var(--color-ba-btn-gray)' }}>
          Discard
        </button>
        {!item.duplicate && (
          <button type="button" onClick={onSave} className="px-3 py-1 text-xs font-semibold text-neutral-900 hover:opacity-90" style={{ backgroundColor: 'var(--color-ba-btn-blue)' }}>
            Save
          </button>
        )}
      </div>
    </div>
  );
}
