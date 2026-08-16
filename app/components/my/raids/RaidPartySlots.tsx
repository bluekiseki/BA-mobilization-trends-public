import { StudentIcon } from '~/components/dashboard/studentIcon';
import { HiOutlineXMark } from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import type { Character, PortraitData } from '~/components/dashboard/common';
import type { RaidHistoryStudent } from '~/types/raidHistory';
import type { Student } from '~/types/plannerData';
import type { ReactNode } from 'react';

type SquadType = 'Main' | 'Support';

interface RaidPartySlotsProps {
  m: (RaidHistoryStudent | null)[];
  s: (RaidHistoryStudent | null)[];
  students: Record<string, Student>;
  portraitData: PortraitData;
  teamMemberCount?: 6 | 10;
  title?: string;
  activeSlot?: { role: SquadType; index: number } | null;
  activePicker?: ReactNode;
  onPickSlot: (role: SquadType, index: number) => void;
  onClearSlot: (role: SquadType, index: number) => void;
}

function Slot({
  role,
  index,
  value,
  students,
  portraitData,
  teamMemberCount,
  isActive,
  onPickSlot,
  onClearSlot,
}: {
  role: SquadType;
  index: number;
  value: RaidHistoryStudent | null;
  students: Record<string, Student>;
  portraitData: PortraitData;
  teamMemberCount: 6 | 10;
  isActive: boolean;
  onPickSlot: (role: SquadType, index: number) => void;
  onClearSlot: (role: SquadType, index: number) => void;
}) {
  const { t } = useTranslation('mypage');
  const student = value ? students[String(value.id)] : undefined;
  const character: Character | undefined = value
    ? {
        id: value.id,
        level: value.level ?? 0,
        star: value.star ?? student?.StarGrade ?? 1,
        hasWeapon: value.hasWeapon ?? false,
        weaponStar: value.weaponStar ?? 0,
        isAssist: value.isAssist ?? false,
        isMulligan: value.isMulligan,
        mulliganIndex: value.mulliganIndex,
      }
    : undefined;

  return (
    // mirrors StudentIcon's own basis-14 min-w-10 max-w-14 so filled/empty slots stay the same size
    <div className="relative min-w-10 max-w-14 flex-1 basis-14">
      <button
        type="button"
        onClick={() => onPickSlot(role, index)}
        className={`aspect-square w-full ${isActive ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${
          value
            ? ''
            : 'rounded border border-dashed border-neutral-300 text-[10px] font-semibold text-neutral-500 hover:border-blue-500 hover:text-blue-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-blue-500 dark:hover:text-blue-400'
        }`}
      >
        {value && character && student ? (
          <StudentIcon character={character} student={student} portraitData={portraitData} teamMemberCount={teamMemberCount} />
        ) : (
          <span>{role === 'Main' ? `M${index + 1}` : `S${index + 1}`}</span>
        )}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onClearSlot(role, index)}
          className="absolute -top-1.5 -left-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-600 text-white hover:bg-red-600 dark:bg-neutral-500 dark:hover:bg-red-500"
          aria-label={t('raids.slotPicker.clearSlot')}
        >
          <HiOutlineXMark className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function RaidPartySlots({ m, s, students, portraitData, teamMemberCount = 6, title, activeSlot, activePicker, onPickSlot, onClearSlot }: RaidPartySlotsProps) {
  return (
    <div className="space-y-2">
      {title && <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>}
      {/* Slot row */}
      <div className="flex items-center gap-1">
        {m.map((slot, index) => (
          <Slot
            key={`m-${index}`}
            role="Main"
            index={index}
            value={slot}
            students={students}
            portraitData={portraitData}
            teamMemberCount={teamMemberCount}
            isActive={activeSlot?.role === 'Main' && activeSlot.index === index}
            onPickSlot={onPickSlot}
            onClearSlot={onClearSlot}
          />
        ))}
        <div className="shrink-0 px-0.5 text-lg text-neutral-400 dark:text-neutral-500">|</div>
        {s.map((slot, index) => (
          <Slot
            key={`s-${index}`}
            role="Support"
            index={index}
            value={slot}
            students={students}
            portraitData={portraitData}
            teamMemberCount={teamMemberCount}
            isActive={activeSlot?.role === 'Support' && activeSlot.index === index}
            onPickSlot={onPickSlot}
            onClearSlot={onClearSlot}
          />
        ))}
      </div>
      {/* Place the picker below the entire slot row */}
      {activePicker && <div>{activePicker}</div>}
    </div>
  );
}
