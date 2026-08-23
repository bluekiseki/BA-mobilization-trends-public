import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { CustomNumberInput } from '~/components/CustomInput';
import { RAID_TROPHIES, type RaidTrophy } from '~/types/resourcePlan';
import type { PortraitData } from '~/components/dashboard/common';
import type { RaidHistoryEntry, RaidHistoryServer, RaidHistoryStudent, RaidHistoryTeam, RaidType } from '~/types/raidHistory';
import type { Student } from '~/types/plannerData';
import type { Locale } from '~/utils/i18n/config';
import type { GameServer } from '~/types/data';
import { getBracketFromTotalScore, getDifficultyFromScoreAndBoss } from '~/components/raid/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatTimeToTimestamp } from '~/utils/time';
import { useRaidHistoryStore } from '~/store/planner/useRaidHistoryStore';
import { RaidPartySlots } from './RaidPartySlots';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';
import { StarRating } from '~/components/StarRating';
import type { RaidOption } from './RaidHistoryTable';

const ALL_STAR_VALUES = [1, 2, 3, 4, 5, 7, 8, 9, 10] as const;
type StarValue = (typeof ALL_STAR_VALUES)[number];

const TROPHY_LABEL: Record<RaidTrophy, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
const TROPHY_ACTIVE: Record<RaidTrophy, string> = {
  platinum: 'text-neutral-900 dark:text-neutral-100',
  gold: 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-300',
  silver: 'border-neutral-400 bg-neutral-100 text-neutral-700 dark:border-neutral-500 dark:bg-neutral-800 dark:text-neutral-200',
  bronze: 'border-amber-700 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
};
const TROPHY_IDLE: Record<RaidTrophy, string> = {
  platinum: 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
  gold: 'border-neutral-300 text-neutral-500 hover:border-amber-400 hover:text-amber-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-amber-500 dark:hover:text-amber-300',
  silver: 'border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800',
  bronze: 'border-neutral-300 text-neutral-500 hover:border-amber-700 hover:text-amber-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-amber-700 dark:hover:text-amber-400',
};

function getTrophyButtonStyle(trophyType: RaidTrophy, isActive: boolean): CSSProperties | undefined {
  if (trophyType !== 'platinum') return undefined;
  return isActive
    ? {
        borderColor: 'var(--color-ba-platinum)',
        backgroundColor: 'color-mix(in srgb, var(--color-ba-platinum) 14%, transparent)',
      }
    : undefined;
}

function fromStarValue(n: StarValue): { star: number; hasWeapon: boolean; weaponStar: number } {
  return n <= 5 ? { star: n, hasWeapon: false, weaponStar: 0 } : { star: 5, hasWeapon: true, weaponStar: n - 6 };
}

function toStarValue(s: RaidHistoryStudent): StarValue {
  if (s.hasWeapon) return (6 + (s.weaponStar ?? 0)) as StarValue;
  return (s.star ?? 1) as StarValue;
}

function toMulliganMode(s: RaidHistoryStudent): MulliganMode {
  if (s.mulliganIndex !== undefined) return 'order';
  if (s.isMulligan) return 'ox';
  return 'none';
}

const STAR_BTN_ACTIVE = 'p-0.5 rounded transition-colors bg-neutral-200 dark:bg-neutral-700 ring-1 ring-amber-400 dark:ring-amber-500';
const STAR_BTN_IDLE = 'p-0.5 rounded transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800';
const FIELD_CLS = 'w-12 rounded border border-neutral-300 px-1.5 py-1 text-center text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';
const LABEL_CLS = 'w-10 shrink-0 text-xs text-neutral-500 dark:text-neutral-400';

const tierBaseLabel = (tier: number) => (tier === 0 ? null : `T${tier}`);

type MulliganMode = 'none' | 'ox' | 'order';

const SlotPicker = forwardRef<
  { focus: () => void },
  {
    students: Record<string, Student>;
    initialValue?: RaidHistoryStudent | null;
    usedMulliganOrders?: Set<number>;
    teamMemberCount?: 6 | 10;
    usedAssistIds?: Set<number>;
    showOptional: boolean;
    getSuggestedStudentBuild?: (studentId: number) => RaidHistoryStudent | null;
    isLastSlot?: boolean;
    onToggleOptional: () => void;
    onSelect: (s: RaidHistoryStudent) => void;
    onSelectAndNext?: (s: RaidHistoryStudent) => void;
    onClose?: () => void;
  }
>(function SlotPicker(
  { students, initialValue, usedMulliganOrders, teamMemberCount = 6, usedAssistIds, showOptional, getSuggestedStudentBuild, isLastSlot = false, onToggleOptional, onSelect, onSelectAndNext, onClose },
  ref,
) {
  const { t } = useTranslation('mypage');
  const { t: t_ui } = useTranslation('ui');
  const { t: td } = useTranslation('dashboard');
  const { t: tp } = useTranslation(['planner', 'game']);
  const { t: t_g } = useTranslation('game');
  const containerRef = useRef<HTMLDivElement>(null);
  const selectAndNextRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => containerRef.current?.querySelector<HTMLInputElement>('input')?.focus(),
  }));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const el = document.activeElement as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || el.isContentEditable) return;
      selectAndNextRef.current?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [pendingId, setPendingId] = useState<number | null>(initialValue?.id ?? null);
  const [starValue, setStarValue] = useState<StarValue | null>(initialValue ? toStarValue(initialValue) : null);
  const [isAssist, setIsAssist] = useState(initialValue?.isAssist ?? false);
  const [level, setLevel] = useState(initialValue?.level ?? 90);
  const [equipment, setEquipment] = useState<[number, number, number]>(initialValue?.equipment ?? [10, 10, 10]);
  const [skills, setSkills] = useState(initialValue?.skills ?? { ex: 5, normal: 10, passive: 10, sub: 10 });
  const [notes, setNotes] = useState(initialValue?.notes ?? '');
  const [mulliganMode, setMulliganMode] = useState<MulliganMode>(initialValue ? toMulliganMode(initialValue) : 'none');
  const [mulliganOrder, setMulliganOrder] = useState(initialValue?.mulliganIndex !== undefined ? initialValue.mulliganIndex + 1 : 1);

  const pendingStudent = pendingId !== null ? students[String(pendingId)] : null;
  const assistConflict = isAssist && pendingId !== null && (usedAssistIds?.has(pendingId) ?? false);

  const save = (
    overrides: {
      id?: number;
      star?: StarValue;
      assist?: boolean;
      lv?: number;
      mode?: MulliganMode;
      order?: number;
      eq?: [number, number, number];
      sk?: typeof skills;
      nt?: string;
    } = {},
  ) => {
    const id = overrides.id ?? pendingId;
    const sv = overrides.star ?? starValue;
    if (id === null || sv === null) return;
    const { star, hasWeapon, weaponStar } = fromStarValue(sv);
    const mode = overrides.mode ?? mulliganMode;
    const ord = overrides.order ?? mulliganOrder;
    const assist = overrides.assist ?? isAssist;
    const lv = overrides.lv ?? level;
    const eq = overrides.eq ?? equipment;
    const sk = overrides.sk ?? skills;
    const nt = overrides.nt ?? notes;
    onSelect({
      id,
      star,
      hasWeapon,
      weaponStar,
      isAssist: assist || undefined,
      isMulligan: mode === 'ox' ? true : undefined,
      mulliganIndex: mode === 'order' ? ord - 1 : undefined,
      level: lv,
      equipment: showOptional ? eq : undefined,
      skills: showOptional ? sk : undefined,
      notes: showOptional && nt.trim() ? nt.trim() : undefined,
    });
  };

  const buildStudent = (): RaidHistoryStudent | null => {
    if (pendingId === null || starValue === null) return null;
    const { star, hasWeapon, weaponStar } = fromStarValue(starValue);
    return {
      id: pendingId,
      star,
      hasWeapon,
      weaponStar,
      isAssist: isAssist || undefined,
      isMulligan: mulliganMode === 'ox' ? true : undefined,
      mulliganIndex: mulliganMode === 'order' ? mulliganOrder - 1 : undefined,
      level,
      equipment: showOptional ? equipment : undefined,
      skills: showOptional ? skills : undefined,
      notes: showOptional && notes.trim() ? notes.trim() : undefined,
    };
  };

  const resetFields = () => {
    setPendingId(null);
    setStarValue(null);
    setIsAssist(false);
    setLevel(90);
    setMulliganMode('none');
    setMulliganOrder(1);
    setEquipment([10, 10, 10]);
    setSkills({ ex: 5, normal: 10, passive: 10, sub: 10 });
    setNotes('');
  };

  selectAndNextRef.current = () => {
    if (pendingId === null || !onSelectAndNext) return;
    const s = buildStudent();
    if (!s) return;
    onSelectAndNext(s);
    resetFields();
  };

  const handleStudentPick = (id: number) => {
    const student = students[String(id)];
    if (!student) return;
    const suggested = getSuggestedStudentBuild?.(id);
    const nextStarValue = suggested ? toStarValue(suggested) : starValue === null || starValue < student.StarGrade ? (student.StarGrade as StarValue) : starValue;
    setPendingId(id);
    setStarValue(nextStarValue);
    setLevel(suggested?.level ?? level);
    save({ id, star: nextStarValue, lv: suggested?.level ?? level });
  };

  const validStarValues = pendingStudent ? ALL_STAR_VALUES.filter((n) => n >= pendingStudent.StarGrade) : [...ALL_STAR_VALUES];

  return (
    <div ref={containerRef} className="space-y-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <StudentSearchDropdown students={students} selectedStudentId={pendingId} setSelectedStudentId={handleStudentPick} hideLavel />

      <>
        {/* star grade */}
        <div className="flex flex-wrap items-center gap-1 border-t border-neutral-100 pt-2 dark:border-neutral-800/60">
          <span className={LABEL_CLS}>{t_g('starRank')}</span>
          {validStarValues.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setStarValue(n);
                save({ star: n });
              }}
              className={starValue === n ? STAR_BTN_ACTIVE : STAR_BTN_IDLE}
            >
              <StarRating n={n} />
            </button>
          ))}
        </div>

        {/* assist */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <input
              type="checkbox"
              checked={isAssist}
              onChange={(e) => {
                setIsAssist(e.target.checked);
                save({ assist: e.target.checked });
              }}
              className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
            />
            {td('assist')}
          </label>
          {assistConflict && <span className="text-xs text-red-500 dark:text-red-400">{t('raids.slotPicker.assistConflict')}</span>}
        </div>

        {/* mulligan */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={LABEL_CLS}>{t('raids.slotPicker.mulligan')}</span>
          <input
            type="checkbox"
            checked={mulliganMode !== 'none'}
            onChange={(e) => {
              const mode: MulliganMode = e.target.checked ? 'ox' : 'none';
              setMulliganMode(mode);
              if (!e.target.checked) setMulliganOrder(1);
              save({ mode, order: e.target.checked ? mulliganOrder : 1 });
            }}
            className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
          />
          <span className="text-neutral-300 dark:text-neutral-700">|</span>
          {(teamMemberCount === 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5]).map((n) => {
            const isActive = mulliganMode === 'order' && mulliganOrder === n;
            const isDisabled = !isActive && (usedMulliganOrders?.has(n - 1) ?? false);
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setMulliganMode('order');
                  setMulliganOrder(n);
                  save({ mode: 'order', order: n });
                }}
                disabled={isDisabled}
                className={`h-6 w-6 rounded text-xs font-bold transition-colors ${isActive ? 'bg-neutral-700 text-white dark:bg-neutral-400 dark:text-neutral-900' : isDisabled ? 'cursor-not-allowed text-neutral-200 dark:text-neutral-700' : 'text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
              >
                {n}
              </button>
            );
          })}
        </div>

        {/* level */}
        <div className="flex items-center gap-2">
          <span className={LABEL_CLS}>{tp('game:level')}</span>
          <CustomNumberInput
            value={level}
            onChange={(lv) => {
              if (lv === null) return;
              setLevel(lv);
              save({ lv });
            }}
            min={1}
            max={90}
            className={FIELD_CLS}
          />
        </div>

        {/* optional toggle */}
        <button type="button" onClick={onToggleOptional} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          {showOptional ? t('raids.slotPicker.collapseOptional') : t('raids.slotPicker.expandOptional')}
        </button>

        {showOptional && (
          <>
            {/* equipment */}
            <div className="flex items-center gap-2">
              <span className={LABEL_CLS}>{tp('game:equipment')}</span>
              {([0, 1, 2] as const).map((slot) => (
                <select
                  key={slot}
                  value={equipment[slot]}
                  onChange={(e) => {
                    const eq: [number, number, number] = [...equipment];
                    eq[slot] = Number(e.target.value);
                    setEquipment(eq);
                    save({ eq });
                  }}
                  className={FIELD_CLS}
                >
                  {Array.from({ length: 11 }, (_, tier) => (
                    <option key={tier} value={tier}>
                      {tierBaseLabel(tier) ?? t_ui('none')}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            {/* skills */}
            <div className="flex items-center gap-2">
              <span className={LABEL_CLS}>{tp('game:skills')}</span>
              {(['ex', 'normal', 'passive', 'sub'] as const).map((key) => {
                const isEx = key === 'ex';
                const min = isEx ? 1 : 0;
                const max = isEx ? 5 : 10;
                return (
                  <div key={key} className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{isEx ? 'EX' : key === 'normal' ? 'N' : key === 'passive' ? 'P' : 'B'}</span>
                    <select
                      value={skills[key]}
                      onChange={(e) => {
                        const sk = { ...skills, [key]: Number(e.target.value) };
                        setSkills(sk);
                        save({ sk });
                      }}
                      className={FIELD_CLS}
                    >
                      {Array.from({ length: max - min + 1 }, (_, i) => {
                        const val = min + i;
                        return (
                          <option key={val} value={val}>
                            {val === max ? `${val} (Max)` : String(val)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>

            {/* notes */}
            <div className="flex items-center gap-2">
              <span className={LABEL_CLS}>{t('raids.notes')}</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  save({ nt: e.target.value });
                }}
                placeholder={t('raids.slotPicker.notesPlaceholder')}
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          {onSelectAndNext && (
            <button
              type="button"
              disabled={pendingId === null}
              onClick={() => {
                const s = buildStudent();
                if (!s || !onSelectAndNext) return;
                onSelectAndNext(s);
                resetFields();
              }}
              className="flex items-center gap-1.5 rounded border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {isLastSlot ? t('raids.slotPicker.nextParty') : t('raids.slotPicker.confirmAndNext')}
              <kbd className="rounded border border-neutral-300 px-1 py-0.5 font-mono text-[10px] font-normal opacity-60 dark:border-neutral-600">Enter</kbd>
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded bg-ba-btn-blue px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark">
            {t_ui('confirm')}
          </button>
        </div>
      </>
    </div>
  );
});

type SquadType = 'Main' | 'Support';
type SquadSlot = { teamIndex: number; role: SquadType; index: number };

function getOtherStudentIds(team: RaidHistoryTeam, slot: SquadSlot): Set<number> {
  const activeIndex = slot.role === 'Main' ? slot.index : team.m.length + slot.index;
  return new Set([...team.m, ...team.s].flatMap((student, index) => (student && index !== activeIndex ? [student.id] : [])));
}

interface RaidHistoryFormModalProps {
  raidOptions: RaidOption[];
  serverOptions: { value: RaidHistoryServer; label: string }[];
  defaultServer: RaidHistoryServer;
  students: Record<string, Student>;
  portraitData: PortraitData;
  locale: Locale;
  initialEntry?: RaidHistoryEntry;
  onClose: () => void;
  onSave: (entry: RaidHistoryEntry) => void;
}

function createEntryId() {
  return `rh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSlots(slots: (RaidHistoryStudent | null)[], length: number) {
  return Array.from({ length }, (_, index) => slots[index] ?? null);
}

function hasStudents(team: RaidHistoryTeam): boolean {
  return [...team.m, ...team.s].some((student) => student !== null);
}

function createEmptyTeam(strikerCount: number, specialCount: number, extras: Partial<RaidHistoryTeam> = {}): RaidHistoryTeam {
  return {
    m: Array.from({ length: strikerCount }, () => null),
    s: Array.from({ length: specialCount }, () => null),
    ...extras,
  };
}

function getClosestStudentBuild(entries: RaidHistoryEntry[], server: RaidHistoryServer, date: string, studentId: number): RaidHistoryStudent | null {
  let best: RaidHistoryStudent | null = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const entry of entries) {
    if (entry.server !== server) continue;
    for (const slot of [...(entry.teams?.flatMap((team) => [...team.m, ...team.s]) ?? []), ...(entry.m ?? []), ...(entry.s ?? [])]) {
      if (!slot || slot.id !== studentId || slot.isAssist) continue;
      const distance = Math.abs(new Date(entry.date).getTime() - new Date(date).getTime());
      if (distance < bestDistance) {
        best = slot;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function getTeamShape(type: RaidType | undefined): { strikerCount: number; specialCount: number; teamCount: number } {
  if (type === 'multifloor') return { strikerCount: 6, specialCount: 4, teamCount: 1 };
  if (type === 'eraid') return { strikerCount: 4, specialCount: 2, teamCount: 3 };
  if (type === 'jfd') return { strikerCount: 4, specialCount: 2, teamCount: 3 };
  return { strikerCount: 4, specialCount: 2, teamCount: 1 };
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return Number(trimmed.replaceAll(',', ''));
}

function getScoreDifficulty(scoreValue: number | undefined, raidInfo: RaidOption | undefined, server: RaidHistoryServer): string {
  if (scoreValue === undefined || !raidInfo) return '-';
  const gameServer: GameServer = server === 'jp' ? 'jp' : 'kr';
  return getDifficultyFromScoreAndBoss(scoreValue, gameServer, raidInfo.id);
}

function getScoreTime(scoreValue: number | undefined, raidInfo: RaidOption | undefined, server: RaidHistoryServer): string | null {
  if (scoreValue === undefined || !raidInfo) return null;
  try {
    const gameServer: GameServer = server === 'jp' ? 'jp' : 'kr';
    const seconds = calculateTimeFromScore(scoreValue, raidInfo.boss, gameServer, raidInfo.id);
    return seconds === undefined ? null : formatTimeToTimestamp(seconds);
  } catch {
    return null;
  }
}

function getArmorScore(teams: RaidHistoryTeam[], armorType: string): number | undefined {
  return teams.find((team) => team.armorType === armorType && typeof team.score === 'number')?.score;
}

function getArmorMeta(teams: RaidHistoryTeam[], armorType: string): RaidHistoryTeam | undefined {
  return teams.find((team) => team.armorType === armorType);
}

function sumDefinedScores(scores: Array<number | undefined>): number | undefined {
  const definedScores = scores.filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  if (definedScores.length === 0) return undefined;
  return definedScores.reduce((sum, value) => sum + value, 0);
}

function getDefaultArmorTypes(raid: RaidOption | undefined) {
  return raid?.armorTypes?.length
    ? raid.armorTypes
    : [
        { value: 'LightArmor', label: 'LightArmor' },
        { value: 'HeavyArmor', label: 'HeavyArmor' },
        { value: 'Unarmed', label: 'Unarmed' },
      ];
}

function filterStudentsBySquadType(students: Record<string, Student>, squadType: SquadType | null) {
  if (!squadType) return students;
  return Object.fromEntries(
    Object.entries(students).filter(([id, student]) => {
      const studentSquadType = student.SquadType || (Number(id) < 20000 ? 'Main' : 'Support');
      return studentSquadType === squadType;
    }),
  );
}

function MetricBox({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className={`${mono ? 'font-mono' : ''} font-semibold text-neutral-900 dark:text-neutral-100`}>{value}</div>
    </div>
  );
}

function GuideFields({
  guideUrl,
  noGuide,
  notes,
  linkLabel,
  notesLabel,
  onGuideUrlChange,
  onNoGuideChange,
  onNotesChange,
}: {
  guideUrl: string;
  noGuide: boolean;
  notes?: string;
  linkLabel: string;
  notesLabel?: string;
  onGuideUrlChange: (value: string) => void;
  onNoGuideChange: (value: boolean) => void;
  onNotesChange?: (value: string) => void;
}) {
  const { t } = useTranslation('mypage');
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
      <label className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{linkLabel}</div>
        <input
          type="url"
          pattern="https?://.*"
          value={guideUrl}
          onChange={(event) => onGuideUrlChange(event.currentTarget.value.slice(0, 500))}
          placeholder="https:// Or http://"
          className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="flex items-end gap-2 pb-2 text-sm text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={noGuide}
          onChange={(event) => onNoGuideChange(event.currentTarget.checked)}
          className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800"
        />
        {t('raids.noGuide')}
      </label>
      {onNotesChange && (
        <label className="space-y-1 md:col-span-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{notesLabel ?? t('raids.notes')}</div>
          <textarea
            value={notes ?? ''}
            onChange={(event) => onNotesChange(event.currentTarget.value.slice(0, 200))}
            rows={2}
            className="w-full rounded border min-h-30 border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      )}
    </div>
  );
}

function buildInitialTeams(entry: RaidHistoryEntry | undefined, type: RaidType | undefined, raid: RaidOption | undefined): RaidHistoryTeam[] {
  const shape = getTeamShape(type);
  if (entry?.teams?.length) {
    return entry.teams.map((team, index) => ({
      ...createEmptyTeam(shape.strikerCount, shape.specialCount),
      ...team,
      armorType: team.armorType ?? (type === 'eraid' ? getDefaultArmorTypes(raid)[index]?.value : undefined),
      m: normalizeSlots(team.m, shape.strikerCount),
      s: normalizeSlots(team.s, shape.specialCount),
    }));
  }
  if (type === 'eraid') {
    return getDefaultArmorTypes(raid).map((armorType) => createEmptyTeam(shape.strikerCount, shape.specialCount, { armorType: armorType.value }));
  }
  return Array.from({ length: shape.teamCount }, () =>
    createEmptyTeam(shape.strikerCount, shape.specialCount, {
      difficulty: type === 'jfd' ? '4' : undefined,
    }),
  );
}

export function RaidHistoryFormModal({ raidOptions, serverOptions, defaultServer, students, portraitData, initialEntry, onClose, onSave }: RaidHistoryFormModalProps) {
  const { t } = useTranslation('mypage');
  const { t: td } = useTranslation('dashboard');
  const { t: tc } = useTranslation('common');
  // const { t: ta } = useTranslation('auth');
  const { t: t_g } = useTranslation('game');
  const { t: t_ui } = useTranslation('ui');
  const historyEntries = useRaidHistoryStore((state) => state.entries);
  const firstServer = defaultServer;
  const firstRaid = raidOptions.find((raid) => raid.server === firstServer) ?? raidOptions[0];
  const [server, setServer] = useState<RaidHistoryServer>(initialEntry?.server ?? firstRaid?.server ?? firstServer);
  const [raidId, setRaidId] = useState(initialEntry?.raidId ?? firstRaid?.id ?? '');
  const [trophy, setTrophy] = useState<RaidTrophy>(initialEntry?.trophy ?? 'platinum');
  const [score, setScore] = useState(initialEntry?.score?.toString() ?? '');
  const [rank, setRank] = useState<number | null>(initialEntry?.rank ?? null);
  const [floor, setFloor] = useState<number | null>(initialEntry?.floor ?? null);
  const [clearTime, setClearTime] = useState(initialEntry?.clearTime ?? '');
  const [guideUrl, setGuideUrl] = useState(initialEntry?.guideUrl ?? '');
  const [noGuide, setNoGuide] = useState(initialEntry?.noGuide ?? false);
  const [notes, setNotes] = useState(initialEntry?.notes ?? '');
  const [teams, setTeams] = useState<RaidHistoryTeam[]>(buildInitialTeams(initialEntry, initialEntry?.raidType ?? firstRaid?.type, firstRaid));
  const [activeSlot, setActiveSlot] = useState<SquadSlot | null>(null);
  const [activeArmorType, setActiveArmorType] = useState(initialEntry?.teams?.find((team) => team.armorType)?.armorType ?? firstRaid?.armorTypes?.[0]?.value ?? 'LightArmor');
  const [showSlotOptional, setShowSlotOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const slotPickerRef = useRef<{ focus: () => void }>(null);

  const focusSlotPicker = () => setTimeout(() => slotPickerRef.current?.focus(), 0);

  const serverRaidOptions = useMemo(() => raidOptions.filter((raid) => raid.server === server), [raidOptions, server]);
  const selectedRaid = useMemo(() => serverRaidOptions.find((raid) => raid.id === raidId), [raidId, serverRaidOptions]);
  const teamShape = getTeamShape(selectedRaid?.type);
  const isRestriction = selectedRaid?.type === 'multifloor';
  const isJfd = selectedRaid?.type === 'jfd';
  const isElimination = selectedRaid?.type === 'eraid';
  const isRaid = selectedRaid?.type === 'raid';
  const isRaidLike = isRaid || isElimination;
  const parsedScore = parseOptionalInteger(score);
  const armorTypes = getDefaultArmorTypes(selectedRaid);
  const totalScore = isJfd ? sumDefinedScores(teams.map((team) => team.score)) : isElimination ? sumDefinedScores(armorTypes.map((armorType) => getArmorScore(teams, armorType.value))) : parsedScore;
  const displayedDifficulty = isElimination ? (totalScore ? getBracketFromTotalScore(totalScore) : '-') : getScoreDifficulty(totalScore, selectedRaid, server);
  const displayedScoreTime = isRaid ? getScoreTime(parsedScore, selectedRaid, server) : null;
  const visibleTeams = isElimination ? teams.map((team, index) => ({ team, index })).filter(({ team }) => team.armorType === activeArmorType) : teams.map((team, index) => ({ team, index }));
  const activeArmorMeta = getArmorMeta(teams, activeArmorType);
  const activeArmorScoreTime = isElimination ? getScoreTime(activeArmorMeta?.score, selectedRaid, server) : null;
  const slotStudents = useMemo(() => {
    const roleFilteredStudents = filterStudentsBySquadType(students, activeSlot?.role ?? null);
    if (!activeSlot) return roleFilteredStudents;
    const activeTeam = teams[activeSlot.teamIndex];
    if (!activeTeam) return roleFilteredStudents;
    const usedStudentIds = getOtherStudentIds(activeTeam, activeSlot);
    return Object.fromEntries(Object.entries(roleFilteredStudents).filter(([id]) => !usedStudentIds.has(Number(id))));
  }, [activeSlot, students, teams]);
  const referenceDate = selectedRaid?.startDate ?? initialEntry?.date ?? '';
  const getSuggestedStudentBuild = (studentId: number) => (referenceDate ? getClosestStudentBuild(historyEntries, server, referenceDate, studentId) : null);

  useEffect(() => {
    if (initialEntry) return;
    setTeams(buildInitialTeams(undefined, selectedRaid?.type, selectedRaid));
    setActiveArmorType(getDefaultArmorTypes(selectedRaid)[0]?.value ?? 'LightArmor');
    setScore('');
  }, [initialEntry, selectedRaid]);

  const raidsWithPlans = useMemo(() => {
    const set = new Set<string>();
    for (const entry of historyEntries) {
      if (!initialEntry || entry.id !== initialEntry.id) {
        set.add(`${entry.server}:${entry.raidId}`);
      }
    }
    return set;
  }, [historyEntries, initialEntry]);

  const changeServer = (nextServer: RaidHistoryServer) => {
    const nextRaidOptions = raidOptions.filter((raid) => raid.server === nextServer);
    setServer(nextServer);
    setRaidId(nextRaidOptions[0]?.id ?? '');
  };

  const clearSlot = (teamIndex: number, role: SquadType, index: number) => {
    setTeams((currentTeams) =>
      currentTeams.map((team, currentTeamIndex) => {
        if (currentTeamIndex !== teamIndex) return team;
        const key = role === 'Main' ? 'm' : 's';
        return { ...team, [key]: team[key].map((slot, slotIndex) => (slotIndex === index ? null : slot)) };
      }),
    );
  };

  const updateTeamDifficulty = (teamIndex: number, nextDifficulty: '1' | '2' | '3' | '4') => {
    setTeams((currentTeams) => currentTeams.map((team, currentTeamIndex) => (currentTeamIndex === teamIndex ? { ...team, difficulty: nextDifficulty } : team)));
  };

  const updateTeamField = <K extends keyof RaidHistoryTeam>(teamIndex: number, key: K, value: RaidHistoryTeam[K]) => {
    setTeams((currentTeams) => currentTeams.map((team, currentTeamIndex) => (currentTeamIndex === teamIndex ? { ...team, [key]: value } : team)));
  };

  const updateArmorField = <K extends keyof RaidHistoryTeam>(armorType: string, key: K, value: RaidHistoryTeam[K]) => {
    setTeams((currentTeams) => {
      let updatedFirst = false;
      return currentTeams.map((team) => {
        if (team.armorType !== armorType || updatedFirst) return team;
        updatedFirst = true;
        return { ...team, [key]: value };
      });
    });
  };

  const deleteTeam = (teamIndex: number) => {
    setTeams((currentTeams) => currentTeams.filter((_, currentTeamIndex) => currentTeamIndex !== teamIndex));
    setActiveSlot(null);
  };

  const addTeam = () => {
    setTeams((currentTeams) => [...currentTeams, createEmptyTeam(teamShape.strikerCount, teamShape.specialCount, { armorType: isElimination ? activeArmorType : undefined })]);
  };

  const computeUsedAssistIds = (slot: SquadSlot): Set<number> => {
    const currentArmorType = teams[slot.teamIndex]?.armorType;
    const ids = new Set<number>();
    teams.forEach((team, i) => {
      if (isElimination && team.armorType !== currentArmorType) return;
      [...team.m, ...team.s].forEach((s, j) => {
        if (!s?.isAssist) return;
        const slotRole: SquadType = j < team.m.length ? 'Main' : 'Support';
        const slotIdx = j < team.m.length ? j : j - team.m.length;
        if (i === slot.teamIndex && slotRole === slot.role && slotIdx === slot.index) return;
        ids.add(s.id);
      });
    });
    return ids;
  };

  const applyPickStudent = (next: RaidHistoryStudent, slot: SquadSlot): boolean => {
    const activeTeam = teams[slot.teamIndex];
    if (getOtherStudentIds(activeTeam, slot).has(next.id)) {
      setSlotError(t('raids.error.studentDuplicate'));
      return false;
    }

    if (next.isAssist) {
      if (computeUsedAssistIds(slot).has(next.id)) {
        setSlotError(isElimination ? t('raids.error.assistDuplicateArmor') : t('raids.error.assistDuplicate'));
        return false;
      }
    } else {
      // Non-assist: no duplicates within scope (elimination scopes to same armorType; others scope to all teams).
      const currentArmorType = teams[slot.teamIndex]?.armorType;
      const isDuplicate = teams.some((team, i) => {
        if (isElimination && team.armorType !== currentArmorType) return false;
        return [...team.m, ...team.s].some((s, j) => {
          const slotRole: SquadType = j < team.m.length ? 'Main' : 'Support';
          const slotIdx = j < team.m.length ? j : j - team.m.length;
          if (i === slot.teamIndex && slotRole === slot.role && slotIdx === slot.index) return false;
          return s?.id === next.id && !s?.isAssist;
        });
      });
      if (isDuplicate) {
        setSlotError(t('raids.error.studentDuplicateWithoutAssist'));
        return false;
      }
    }
    setTeams((currentTeams) =>
      currentTeams.map((team, teamIndex) => {
        if (teamIndex !== slot.teamIndex) return team;
        const key = slot.role === 'Main' ? 'm' : 's';
        return { ...team, [key]: team[key].map((s, slotIndex) => (slotIndex === slot.index ? next : s)) };
      }),
    );
    setSlotError(null);
    return true;
  };

  const pickStudent = (next: RaidHistoryStudent) => {
    if (!activeSlot) return;
    applyPickStudent(next, activeSlot);
  };

  const pickStudentAndNext = (next: RaidHistoryStudent) => {
    if (!activeSlot) return;
    if (!applyPickStudent(next, activeSlot)) return;
    const { teamIndex, role, index } = activeSlot;
    const team = teams[teamIndex];
    if (role === 'Main' && index < team.m.length - 1) {
      setActiveSlot({ teamIndex, role: 'Main', index: index + 1 });
      focusSlotPicker();
    } else if (role === 'Main' && team.s.length > 0) {
      setActiveSlot({ teamIndex, role: 'Support', index: 0 });
      focusSlotPicker();
    } else if (role === 'Support' && index < team.s.length - 1) {
      setActiveSlot({ teamIndex, role: 'Support', index: index + 1 });
      focusSlotPicker();
    } else if (isRaid || isElimination) {
      const newTeamIndex = teams.length;
      addTeam();
      setActiveSlot({ teamIndex: newTeamIndex, role: 'Main', index: 0 });
      focusSlotPicker();
    } else {
      setActiveSlot(null);
    }
  };

  const submit = () => {
    const parsedScoreForSubmit = parseOptionalInteger(score);
    const parsedRank = rank ?? undefined;
    const parsedFloor = floor ?? undefined;

    if (!raidId || !selectedRaid) {
      setError(t('raids.error.noRaidSelected'));
      return;
    }
    if (isRaid && parsedScoreForSubmit !== undefined && (!Number.isInteger(parsedScoreForSubmit) || parsedScoreForSubmit < 0)) {
      setError(t('raids.error.scoreInvalid'));
      return;
    }
    if (isJfd && teams.some((team) => team.score !== undefined && (!Number.isInteger(team.score) || team.score < 0))) {
      setError(t('raids.error.scoreOptionalInvalid'));
      return;
    }
    if (
      isElimination &&
      armorTypes.some((armorType) => {
        const armorScore = getArmorScore(teams, armorType.value);
        return armorScore !== undefined && (!Number.isInteger(armorScore) || armorScore < 0);
      })
    ) {
      setError(t('raids.error.scoreOptionalInvalid'));
      return;
    }
    if (isRaidLike && parsedRank !== undefined && (!Number.isInteger(parsedRank) || parsedRank <= 0)) {
      setError(t('raids.error.rankInvalid'));
      return;
    }
    if (isRestriction && (parsedFloor === undefined || !Number.isInteger(parsedFloor) || parsedFloor < 1 || parsedFloor > 124)) {
      setError(t('raids.error.floorInvalid'));
      return;
    }
    if (guideUrl.trim() && !/^https?:\/\/\S+$/i.test(guideUrl.trim())) {
      setError(t('raids.error.guideLinkInvalid'));
      return;
    }
    if (teams.some((team) => team.guideUrl?.trim() && !/^https?:\/\/\S+$/i.test(team.guideUrl.trim()))) {
      setError(t('raids.error.armorGuideLinkInvalid'));
      return;
    }

    const seenArmorTypes = new Set<string>();
    const normalizedTeams = teams.filter(hasStudents).map((team) => {
      const isFirstArmorTeam = isElimination && team.armorType ? !seenArmorTypes.has(team.armorType) : false;
      if (team.armorType) seenArmorTypes.add(team.armorType);
      const armorMeta = isFirstArmorTeam && team.armorType ? getArmorMeta(teams, team.armorType) : undefined;
      const armorScore = armorMeta?.score;
      return {
        difficulty: isJfd ? (team.difficulty ?? '4') : isFirstArmorTeam ? getScoreDifficulty(armorScore, selectedRaid, server) : undefined,
        armorType: isElimination ? team.armorType : undefined,
        score: isJfd ? team.score : isFirstArmorTeam ? armorScore : undefined,
        m: normalizeSlots(team.m, teamShape.strikerCount),
        s: normalizeSlots(team.s, teamShape.specialCount),
        guideUrl: isFirstArmorTeam ? armorMeta?.guideUrl?.trim() || undefined : undefined,
        noGuide: isFirstArmorTeam ? armorMeta?.noGuide : undefined,
        notes: isFirstArmorTeam ? armorMeta?.notes?.trim() || undefined : undefined,
      };
    });

    const entry: RaidHistoryEntry = {
      id: initialEntry?.id ?? createEntryId(),
      raidId,
      raidType: selectedRaid.type,
      server,
      date: selectedRaid.startDate,
      difficulty: isRaidLike ? displayedDifficulty : undefined,
      trophy: isRaidLike ? trophy : undefined,
      score: isRestriction ? undefined : isRaid ? parsedScoreForSubmit : totalScore,
      rank: isRaidLike ? parsedRank : undefined,
      floor: isRestriction ? parsedFloor : undefined,
      clearTime: isRestriction ? clearTime.trim() || undefined : undefined,
      teams: normalizedTeams.length > 0 ? normalizedTeams : undefined,
      guideUrl: isElimination ? undefined : guideUrl.trim() || undefined,
      noGuide: isElimination ? undefined : noGuide,
      notes: isElimination ? undefined : notes.trim() || undefined,
    };
    onSave(entry);
  };

  return (
    <div className="fixed inset-0 z-200 flex items-start justify-center overflow-y-auto bg-black/40 px-0 py-0 sm:px-4 sm:py-8">
      <div className="min-h-dvh w-full rounded-none bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 sm:min-h-0 sm:max-w-5xl sm:rounded">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-lg font-bold">{initialEntry ? t('raids.modal.edit') : t('raids.modal.add')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 p-2 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            aria-label={tc('bugReport.close')}
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)]">
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t_ui('server')}</div>
                  <select
                    value={server}
                    onChange={(event) => changeServer(event.currentTarget.value as RaidHistoryServer)}
                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    {serverOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t_g('raid')}</div>
                  <select
                    value={raidId}
                    onChange={(event) => setRaidId(event.currentTarget.value)}
                    className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    {serverRaidOptions.map((raid) => {
                      const key = `${server}:${raid.id}`;
                      const isDisabled = raidsWithPlans.has(key);
                      return (
                        <option key={raid.id} value={raid.id} disabled={isDisabled}>
                          {raid.label} ({raid.startDate}~{raid.endDate})
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              {/* Trophy + score/difficulty/rank */}
              {isRaidLike && (
                <div>
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t_g('trophy')}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {RAID_TROPHIES.map((trophyType) => (
                      <button
                        key={trophyType}
                        type="button"
                        onClick={() => setTrophy(trophyType)}
                        aria-pressed={trophy === trophyType}
                        style={getTrophyButtonStyle(trophyType, trophy === trophyType)}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${trophy === trophyType ? TROPHY_ACTIVE[trophyType] : TROPHY_IDLE[trophyType]}`}
                      >
                        {TROPHY_LABEL[trophyType]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isRestriction ? (
                <div className="grid grid-cols-2 gap-4">
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t('raids.floor')}</div>
                    <CustomNumberInput
                      value={floor}
                      onChange={setFloor}
                      min={1}
                      max={124}
                      placeholder="1~124"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t_ui('clearTime')}</div>
                    <input
                      value={clearTime}
                      onChange={(event) => setClearTime(event.currentTarget.value)}
                      placeholder={t_ui('select')}
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </label>
                </div>
              ) : (
                <div className="flex items-end gap-6">
                  <div className="flex-1">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{isRaid ? td('byScore') : t_ui('totalScore')}</div>
                    {isRaid ? (
                      <>
                        <input
                          inputMode="numeric"
                          value={score}
                          onChange={(event) => setScore(event.currentTarget.value)}
                          placeholder="0"
                          className="w-full border-b-2 border-neutral-200 bg-transparent py-1 text-2xl font-bold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-blue-500 dark:border-neutral-700 dark:text-neutral-100 dark:focus:border-blue-400"
                        />
                        {displayedScoreTime && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t('raids.modal.clearTimeLabel', { time: displayedScoreTime })}</div>}
                      </>
                    ) : (
                      <div className="py-1 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{totalScore ? totalScore.toLocaleString() : '-'}</div>
                    )}
                  </div>
                  {isRaidLike && (
                    <div className="shrink-0 text-right">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        {isElimination ? t('raids.modal.difficultyCombo') : t_g('difficulty')}
                      </div>
                      <div className="py-1 text-lg font-bold text-neutral-900 dark:text-neutral-100">{displayedDifficulty}</div>
                    </div>
                  )}
                  {isRaidLike && (
                    <label className="shrink-0 space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{td('byRank')}</div>
                      <CustomNumberInput
                        value={rank}
                        onChange={setRank}
                        min={1}
                        placeholder={t('raids.modal.rankPlaceholder')}
                        className="w-28 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {isElimination && (
                <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
                  {armorTypes.map((armorType) => (
                    <button
                      key={armorType.value}
                      type="button"
                      onClick={() => {
                        setActiveArmorType(armorType.value);
                        setActiveSlot(null);
                      }}
                      className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${activeArmorType === armorType.value ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'}`}
                    >
                      {armorType.label}
                    </button>
                  ))}
                </div>
              )}

              {isElimination && (
                <div className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">{t('raids.modal.armorScore')}</span>
                    <CustomNumberInput
                      value={activeArmorMeta?.score ?? null}
                      onChange={(v) => updateArmorField(activeArmorType, 'score', v ?? undefined)}
                      min={0}
                      placeholder="0"
                      className="w-full rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                    {activeArmorScoreTime && <div className="text-xs text-neutral-500 dark:text-neutral-400">{t('raids.modal.clearTimeLabel', { time: activeArmorScoreTime })}</div>}
                  </label>
                  <MetricBox label={t('raids.modal.armorDifficulty')} value={getScoreDifficulty(activeArmorMeta?.score, selectedRaid, server)} />
                </div>
              )}

              {visibleTeams.map(({ team, index: teamIndex }, visibleIndex) => (
                <div key={teamIndex} className={teamIndex > 0 ? 'border-t border-neutral-200 pt-4 dark:border-neutral-800' : undefined}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    {isJfd ? (
                      <div className="grid w-full gap-2 md:grid-cols-[9rem_10rem_minmax(0,1fr)]">
                        <label className="flex items-center gap-2 text-sm">
                          <span className="shrink-0 font-medium">{t('raids.modal.party', { n: teamIndex + 1 })}</span>
                          <select
                            value={team.difficulty ?? '4'}
                            onChange={(event) => updateTeamDifficulty(teamIndex, event.currentTarget.value as '1' | '2' | '3' | '4')}
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                          >
                            {(['1', '2', '3', '4'] as const).map((item) => (
                              <option key={item} value={item}>
                                {t('raids.modal.jfdStage', { n: item })}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="shrink-0 font-medium">{td('byScore')}</span>
                          <CustomNumberInput
                            value={team.score ?? null}
                            onChange={(v) => updateTeamField(teamIndex, 'score', v ?? undefined)}
                            min={0}
                            placeholder="0"
                            className="w-full rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                          />
                        </label>
                      </div>
                    ) : (
                      (teams.length > 1 || isElimination) && <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t('raids.modal.party', { n: visibleIndex + 1 })}</div>
                    )}
                    {((isRaid && teams.length > 1) || (isElimination && visibleTeams.length > 1 && visibleIndex > 0)) && (
                      <button
                        type="button"
                        onClick={() => deleteTeam(teamIndex)}
                        className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/20"
                      >
                        {t('raids.modal.deleteParty')}
                      </button>
                    )}
                  </div>
                  <RaidPartySlots
                    m={team.m}
                    s={team.s}
                    students={students}
                    portraitData={portraitData}
                    teamMemberCount={isRestriction ? 10 : 6}
                    activeSlot={activeSlot?.teamIndex === teamIndex ? activeSlot : null}
                    activePicker={
                      activeSlot?.teamIndex === teamIndex ? (
                        <>
                          <SlotPicker
                            key={`${teamIndex}-${activeSlot.role}-${activeSlot.index}`}
                            ref={slotPickerRef}
                            students={slotStudents}
                            initialValue={activeSlot.role === 'Main' ? team.m[activeSlot.index] : team.s[activeSlot.index]}
                            teamMemberCount={isRestriction ? 10 : 6}
                            showOptional={showSlotOptional}
                            getSuggestedStudentBuild={getSuggestedStudentBuild}
                            onToggleOptional={() => setShowSlotOptional((v) => !v)}
                            isLastSlot={activeSlot?.role === 'Support' && activeSlot.index === team.s.length - 1}
                            usedMulliganOrders={
                              new Set(
                                [...team.m, ...team.s].flatMap((s, i) => {
                                  if (!s || s.mulliganIndex === undefined) return [];
                                  const role: SquadType = i < team.m.length ? 'Main' : 'Support';
                                  const idx = i < team.m.length ? i : i - team.m.length;
                                  return !(activeSlot?.role === role && activeSlot.index === idx) ? [s.mulliganIndex] : [];
                                }),
                              )
                            }
                            usedAssistIds={activeSlot ? computeUsedAssistIds(activeSlot) : undefined}
                            onSelect={pickStudent}
                            onSelectAndNext={pickStudentAndNext}
                            onClose={() => setActiveSlot(null)}
                          />
                          {slotError && (
                            <div role="alert" className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                              {slotError}
                            </div>
                          )}
                        </>
                      ) : undefined
                    }
                    onPickSlot={(role, index) => {
                      setSlotError(null);
                      setActiveSlot({ teamIndex, role, index });
                    }}
                    onClearSlot={(role, index) => clearSlot(teamIndex, role, index)}
                  />
                </div>
              ))}

              {(isRaid || isElimination) && (
                <button type="button" onClick={addTeam} className="rounded bg-ba-btn-blue px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark">
                  {t('raids.modal.addParty')}
                </button>
              )}

              {isElimination && (
                <GuideFields
                  guideUrl={activeArmorMeta?.guideUrl ?? ''}
                  noGuide={activeArmorMeta?.noGuide ?? false}
                  notes={activeArmorMeta?.notes}
                  linkLabel={t('raids.modal.armorGuideLink')}
                  notesLabel={t('raids.modal.armorNotes')}
                  onGuideUrlChange={(value) => updateArmorField(activeArmorType, 'guideUrl', value)}
                  onNoGuideChange={(value) => updateArmorField(activeArmorType, 'noGuide', value)}
                  onNotesChange={(value) => updateArmorField(activeArmorType, 'notes', value)}
                />
              )}
            </div>

            {!isElimination && (
              <>
                <label className="block space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{t('raids.notes')}</div>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.currentTarget.value.slice(0, 200))}
                    rows={2}
                    className="w-full min-h-40 rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
                <GuideFields guideUrl={guideUrl} noGuide={noGuide} linkLabel={t('raids.modal.guideLink')} onGuideUrlChange={setGuideUrl} onNoGuideChange={setNoGuide} />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded bg-ba-btn-gray px-4 py-2 text-sm font-semibold text-neutral-900 hover:brightness-95">
              {t_ui('cancel')}
            </button>
            <button type="button" onClick={submit} className="rounded bg-ba-btn-blue px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark">
              {t_ui('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
