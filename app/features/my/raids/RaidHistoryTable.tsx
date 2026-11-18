import { useTranslation } from 'react-i18next';
import { HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi2';
import { StudentIcon } from '~/components/student/studentIcon';
import type { Character } from '~/types/raidReport';
import { type_translation } from '~/components/raid/raidToString';
import type { RaidHistoryEntry, RaidHistoryServer, RaidHistoryStudent, RaidHistoryTeam } from '~/types/raidHistory';
import type { Student } from '~/types/plannerData';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import { formatJfdCoinReward } from '~/features/my/raids/jfdScore';
import { formatTimeToTimestamp } from '~/utils/time';
import type { GameServer } from '~/types/data';
import type { Locale } from '~/utils/i18n/config';
import { getLocaleShortName } from '~/utils/i18n/config';
import type { RaidTrophy } from '~/types/resourcePlan';

const TROPHY_COLOR: Record<RaidTrophy, string> = {
  platinum: 'var(--color-ba-platinum)',
  gold: '#d97706',
  silver: '#a3a3a3',
  bronze: '#92400e',
};

const TROPHY_LABEL: Record<RaidTrophy, string> = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

export interface RaidOption {
  id: string;
  type: RaidHistoryEntry['raidType'];
  server: RaidHistoryServer;
  startDate: string;
  endDate: string;
  boss: string;
  label: string;
  armorTypes?: { value: string; label: string }[];
}

interface RaidHistoryTableProps {
  entries: RaidHistoryEntry[];
  raidOptions: RaidOption[];
  students: Record<string, Student>;
  locale: Locale;
  onEdit: (entry: RaidHistoryEntry) => void;
  onDelete: (id: string) => void;
}

function formatScore(score: number) {
  return score.toLocaleString();
}

function getEntryTeams(entry: RaidHistoryEntry): RaidHistoryTeam[] {
  if (Array.isArray(entry.teams) && entry.teams.length > 0) {
    return entry.teams.map((team) => ({
      difficulty: team.difficulty,
      armorType: team.armorType,
      score: team.score,
      m: Array.isArray(team.m) ? team.m : [],
      s: Array.isArray(team.s) ? team.s : [],
      guideUrl: team.guideUrl,
      noGuide: team.noGuide,
      notes: team.notes,
    }));
  }
  return [{ m: Array.isArray(entry.m) ? entry.m : [], s: Array.isArray(entry.s) ? entry.s : [] }];
}

interface PreviewGroup {
  key: string;
  title: string | null;
  summary: string | null;
  teams: Array<{ team: RaidHistoryTeam; label: string | null }>;
}

function getArmorTypeLabel(armorType: string | undefined, locale: Locale): string {
  if (!armorType) return '-';
  if (armorType in type_translation) {
    return type_translation[armorType as keyof typeof type_translation][getLocaleShortName(locale)];
  }
  return armorType;
}

function getTeamScoreTime(score: number | undefined, entry: RaidHistoryEntry, raidInfo: RaidOption | undefined): string | null {
  if (entry.raidType !== 'eraid' || typeof score !== 'number' || !Number.isFinite(score) || !raidInfo) return null;
  try {
    const server: GameServer = entry.server === 'jp' ? 'jp' : 'kr';
    const seconds = calculateTimeFromScore(score, raidInfo.boss, server, entry.raidId);
    return seconds === undefined ? null : formatTimeToTimestamp(seconds);
  } catch {
    return null;
  }
}

function RaidPartyPreview({ entry, raidInfo, students, locale }: { entry: RaidHistoryEntry; raidInfo: RaidOption | undefined; students: Record<string, Student>; locale: Locale }) {
  const { t } = useTranslation('mypage');
  const teams = getEntryTeams(entry);
  const useWideGroupLayout = entry.raidType === 'eraid' || entry.raidType === 'jfd';
  const previewGroups: PreviewGroup[] =
    entry.raidType === 'eraid'
      ? teams.reduce<PreviewGroup[]>((groups, team, index) => {
          const groupKey = team.armorType ?? `unknown-${index}`;
          const existingGroup = groups.find((group) => group.key === groupKey);
          if (existingGroup) {
            existingGroup.teams.push({
              team,
              label: [team.difficulty ?? null, typeof team.score === 'number' ? formatScore(team.score) : null, getTeamScoreTime(team.score, entry, raidInfo)]
                .filter((value): value is string => Boolean(value))
                .join(' · '),
            });
            return groups;
          }
          groups.push({
            key: groupKey,
            title: getArmorTypeLabel(team.armorType, locale),
            summary: null,
            teams: [
              {
                team,
                label: [team.difficulty ?? null, typeof team.score === 'number' ? formatScore(team.score) : null, getTeamScoreTime(team.score, entry, raidInfo)]
                  .filter((value): value is string => Boolean(value))
                  .join(' · '),
              },
            ],
          });
          return groups;
        }, [])
      : teams.map((team, index) => {
          const jfdTitle = entry.raidType === 'jfd' ? t('raids.modal.jfdStage', { n: team.difficulty ?? index + 1 }) : null;
          const jfdSummary = entry.raidType === 'jfd' && typeof team.score === 'number' ? formatScore(team.score) : null;
          return {
            key: `${entry.raidType}-${index}`,
            title: jfdTitle,
            summary: jfdSummary,
            teams: [{ team, label: null }],
          };
        });

  const renderSlot = (slot: RaidHistoryStudent | null, index: number, role: 'm' | 's') => {
    if (!slot) {
      return <div key={`empty-${role}-${index}`} className="aspect-square w-full rounded border border-dashed border-neutral-300 dark:border-neutral-700" />;
    }
    const student = students[String(slot.id)];
    const character: Character = {
      id: slot.id,
      level: slot.level ?? 0,
      star: slot.star ?? student?.StarGrade ?? 1,
      hasWeapon: slot.hasWeapon ?? false,
      weaponStar: slot.weaponStar ?? 0,
      isAssist: slot.isAssist ?? false,
      isMulligan: slot.isMulligan,
      mulliganIndex: slot.mulliganIndex,
      CombatStyleIndex: student?.StyleId,
    };
    return (
      <div key={`${role}-${slot.id}-${index}`} className="w-full rounded">
        <StudentIcon character={character} student={student} teamMemberCount={entry.raidType === 'multifloor' ? 10 : 6} size="responsive" />
      </div>
    );
  };

  const renderTeam = (team: RaidHistoryTeam, groupKey: string, teamIndex: number) => {
    const totalSlots = team.m.length + team.s.length;
    if (entry.raidType === 'multifloor') {
      const allSlots = [...team.m.map((slot, index) => ({ slot, index, role: 'm' as const })), ...team.s.map((slot, index) => ({ slot, index, role: 's' as const }))];
      return (
        <div key={`${groupKey}-${teamIndex}`} className="grid w-fit grid-cols-5 gap-1 lg:grid-cols-10">
          {allSlots.map(({ slot, index, role }) => (
            <div key={`${role}-wrap-${groupKey}-${teamIndex}-${index}`} className="w-12 min-w-0 sm:w-14 xl:w-16">
              {renderSlot(slot, index, role)}
            </div>
          ))}
        </div>
      );
    }

    if (totalSlots <= 6) {
      const allSlots = [...team.m.map((slot, index) => ({ slot, index, role: 'm' as const })), ...team.s.map((slot, index) => ({ slot, index, role: 's' as const }))];
      return (
        <div key={`${groupKey}-${teamIndex}`} className="grid w-fit grid-cols-6 gap-1">
          {allSlots.map(({ slot, index, role }) => (
            <div key={`${role}-wrap-${groupKey}-${teamIndex}-${index}`} className="w-12 min-w-0 sm:w-14 xl:w-16">
              {renderSlot(slot, index, role)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div key={`${groupKey}-${teamIndex}`} className="grid w-fit gap-1">
        <div className="grid w-fit grid-cols-6 gap-1">
          {team.m.map((slot, index) => (
            <div key={`m-wrap-${groupKey}-${teamIndex}-${index}`} className="w-12 min-w-0 sm:w-14 xl:w-16">
              {renderSlot(slot, index, 'm')}
            </div>
          ))}
        </div>
        <div className="grid w-fit grid-cols-4 gap-1">
          {team.s.map((slot, index) => (
            <div key={`s-wrap-${groupKey}-${teamIndex}-${index}`} className="w-12 min-w-0 sm:w-14 xl:w-16">
              {renderSlot(slot, index, 's')}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={useWideGroupLayout ? 'grid gap-4 lg:grid-cols-3' : 'space-y-2'}>
      {previewGroups.map((group) => (
        <div key={group.key} className="space-y-3">
          {group.teams.map(({ team, label }, teamIndex) => {
            const headerLine = (teamIndex === 0 ? [group.title, group.summary] : [])
              .concat(label ? [label] : [])
              .filter((value): value is string => Boolean(value))
              .join(' · ');
            return (
              <div key={`${group.key}-team-${teamIndex}`} className="space-y-1.5">
                {headerLine && (
                  <div className="truncate text-sm font-semibold text-neutral-700 dark:text-neutral-300" title={headerLine}>
                    {headerLine}
                  </div>
                )}
                {renderTeam(team, group.key, teamIndex)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatResult(entry: RaidHistoryEntry, floorLabel: string): string {
  if (entry.raidType === 'multifloor') return typeof entry.floor === 'number' ? `${floorLabel}${entry.clearTime ? ` · ${entry.clearTime}` : ''}` : '-';
  return typeof entry.score === 'number' && Number.isFinite(entry.score) ? formatScore(entry.score) : '-';
}

function getEntryKey(entry: RaidHistoryEntry, index: number) {
  return entry.id || `${entry.server ?? 'server'}:${entry.raidId ?? 'raid'}:${index}`;
}

function formatServer(server: RaidHistoryServer | undefined) {
  return server ? server.toUpperCase() : '-';
}

function formatRank(rank: number | undefined) {
  return typeof rank === 'number' && Number.isFinite(rank) ? rank.toLocaleString() : undefined;
}

export function RaidHistoryTable({ entries, raidOptions, students, locale, onEdit, onDelete }: RaidHistoryTableProps) {
  const { t } = useTranslation('mypage');
  const { t: t_g } = useTranslation('game');
  const raidInfoByKey = new Map(raidOptions.map((raid) => [`${raid.server}:${raid.id}`, raid]));

  if (entries.length === 0) {
    return <div className="rounded border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">{t('raids.table.empty')}</div>;
  }

  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {entries.map((entry, index) => {
        const raidInfo = raidInfoByKey.get(`${entry.server}:${entry.raidId}`);
        const rankText = formatRank(entry.rank);
        const jfdCoinText = entry.raidType === 'jfd' ? formatJfdCoinReward(entry.score, t_g('coin')) : null;
        const difficultyLabel =
          entry.raidType === 'jfd'
            ? getEntryTeams(entry)
                .map((team) => team.difficulty ?? '4')
                .join('/')
            : entry.difficulty
              ? entry.difficulty
              : '-';
        const secondaryText = rankText ? t('raids.rankText', { rank: rankText }) : jfdCoinText;

        return (
          <article key={getEntryKey(entry, index)} className="py-4 sm:pb-15">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold text-neutral-950 dark:text-neutral-50" title={raidInfo?.label ?? entry.raidId}>
                    {raidInfo?.label ?? entry.raidId}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(entry);
                      }}
                      className="inline-flex items-center justify-center text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 sm:h-auto sm:w-auto"
                      aria-label={t('raids.action.editRecord')}
                    >
                      <HiOutlinePencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(entry.id);
                      }}
                      className="hidden items-center text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 sm:inline-flex"
                      aria-label={t('raids.action.deleteRecord')}
                    >
                      <HiOutlineTrash className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-0 truncate">
                      · {formatServer(entry.server)} {raidInfo ? `· ${raidInfo.startDate} - ${raidInfo.endDate}` : ''}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-base font-semibold text-neutral-950 dark:text-neutral-50 sm:text-lg">{formatResult(entry, t('raids.stats.floorLabel', { floor: entry.floor }))}</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {entry.trophy && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: TROPHY_COLOR[entry.trophy] }}
                        title={TROPHY_LABEL[entry.trophy]}
                        aria-label={TROPHY_LABEL[entry.trophy]}
                      />
                    )}
                    <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{secondaryText ?? (entry.trophy ? '' : '-')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                {difficultyLabel !== '-' && <div className="text-sm text-neutral-500 dark:text-neutral-400">{difficultyLabel}</div>}

                <div className="min-w-0">
                  <RaidPartyPreview entry={entry} raidInfo={raidInfo} students={students} locale={locale} />
                </div>

                {(entry.noGuide || entry.guideUrl) && (
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={entry.guideUrl}>
                    {entry.noGuide ? t('raids.noGuide') : entry.guideUrl}
                  </p>
                )}
                {entry.notes && (
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={entry.notes}>
                    {entry.notes}
                  </p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
