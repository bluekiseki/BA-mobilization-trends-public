import { useMemo, useState } from 'react';
import { SearchableDropdown } from '~/components/common/SearchableDropdown';
import type { PortraitData } from '~/types/raidReport';
import type { Student } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import { useSearchMatcher } from '~/hooks/useSearchMatcher';
import type { OpponentCandidate } from '~/features/my/arena/scan/records';
import { StudentPortrait } from './ArenaTeamRow';

interface Props {
  value: string;
  onChange: (nickname: string) => void;
  candidates: OpponentCandidate[];
  students: Record<string, Student>;
  portraitData: PortraitData;
  locale: string;
}

// Free-text nickname filter with suggestions from saved opponents (avatar, last met, battle count).
export function ArenaNicknameSearch({ value, onChange, candidates, students, portraitData, locale }: Props) {
  const [open, setOpen] = useState(false);
  // Same locale-aware matcher as the student search (e.g. Hangul initial consonants).
  const matcher = useSearchMatcher(locale as Locale);
  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    return q ? candidates.filter((c) => c.nickname.toLowerCase().includes(q) || matcher(c.nickname, q)) : candidates;
  }, [candidates, value, matcher]);

  const select = (nickname: string) => {
    onChange(nickname);
    setOpen(false);
  };

  return (
    <SearchableDropdown
      value={value}
      onChange={onChange}
      isOpen={open && options.length > 0}
      onOpenChange={setOpen}
      inputId="arena-opponent-nickname"
      inputClassName="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-1 text-base text-neutral-900 outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
      className="relative w-full"
      itemCount={options.length}
      onSelectIndex={(i) => select(options[i].nickname)}
    >
      {(highlighted, onHighlight) => (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          {options.map((c, i) => (
            <li
              key={c.nickname}
              data-index={i}
              onClick={() => select(c.nickname)}
              onMouseEnter={() => onHighlight(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === highlighted ? 'bg-neutral-100 dark:bg-neutral-700' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'}`}
            >
              <div className="w-8 shrink-0">{c.avatarId !== null && <StudentPortrait id={c.avatarId} portraitData={portraitData} name={students[String(c.avatarId)]?.Name} />}</div>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-900 dark:text-neutral-100" title={c.nickname}>
                {c.nickname}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {new Date(c.lastAt).toLocaleDateString(locale)} · {c.battles} {c.battles === 1 ? 'battle' : 'battles'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SearchableDropdown>
  );
}
