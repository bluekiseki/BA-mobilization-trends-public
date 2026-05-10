import { useTranslation } from 'react-i18next';

const SKILLS = ['ex', 'normal', 'passive', 'sub'] as const;
const SKILL_LABELS = ['EX', 'N', 'P', 'S'];

interface SpreadsheetHeaderProps {
  hGroup: string;
  hField: string;
  L: { add: number; sel: number; icon: number; name: number; school: number };
  handleSort: (field: string) => void;
  getSortIcon: (field: string) => string;
  screenWidth: number;
}

export function SpreadsheetHeader({ hGroup, hField, L, handleSort, getSortIcon, screenWidth }: SpreadsheetHeaderProps) {
  const { t } = useTranslation('planner', { keyPrefix: 'spreadsheet' });

  return (
    <thead className="sticky top-0 z-40">
      {/* Group row */}
      <tr>
        <th colSpan={5} className={`${hGroup} sticky left-0 z-40 bg-gray-100 dark:bg-neutral-700`} />
        <th colSpan={5} className={`${hGroup} bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`}>
          {t('headerGroup.basicStatsCurrent')}
        </th>
        <th colSpan={4} className={`${hGroup} bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300`}>
          {t('headerGroup.basicStatsTarget')}
        </th>
        <th colSpan={4} className={`${hGroup} bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`}>
          {t('headerGroup.skillsCurrent')}
        </th>
        <th colSpan={4} className={`${hGroup} bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300`}>
          {t('headerGroup.skillsTarget')}
        </th>
        <th colSpan={4} className={`${hGroup} bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300`}>
          {t('headerGroup.equipmentCurrent')}
        </th>
        <th colSpan={4} className={`${hGroup} bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300`}>
          {t('headerGroup.equipmentTarget')}
        </th>
        <th colSpan={5} className={`${hGroup} bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300`}>
          {t('headerGroup.other')}
        </th>
      </tr>

      {/* Field row */}
      <tr>
        <th className={`${hField} sticky z-40 bg-gray-100 dark:bg-neutral-700`} style={{ left: L.add, width: 40, minWidth: 40, maxWidth: 40 }}>
          {t('headerField.add')}
        </th>
        <th
          className={`${hField} sticky z-40 bg-gray-100 dark:bg-neutral-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-600`}
          style={{ left: L.sel, width: 40, minWidth: 40, maxWidth: 40 }}
          onClick={() => handleSort('isSelected')}
        >
          {t('headerField.select')}
          {getSortIcon('isSelected')}
        </th>
        <th className={`${hField} sticky z-40 bg-gray-100 dark:bg-neutral-700`} style={{ left: L.icon, width: 32, minWidth: 32, maxWidth: 32 }} />
        <th
          className={`${hField} sticky z-40 bg-gray-100 dark:bg-neutral-700 text-left pl-2 truncate cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-600`}
          style={{ left: L.name, width: screenWidth > 600 ? 120 : 0, minWidth: screenWidth > 600 ? 120 : 0, maxWidth: screenWidth > 600 ? 120 : 0 }}
          onClick={() => handleSort('name')}
        >
          {t('headerField.name')}
          {getSortIcon('name')}
        </th>
        <th
          className={`${hField} sticky z-40 bg-gray-100 dark:bg-neutral-700 text-left pl-1 truncate cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-600`}
          style={{ left: L.school, width: screenWidth > 600 ? 70 : 0, minWidth: screenWidth > 600 ? 70 : 0, maxWidth: screenWidth > 600 ? 70 : 0 }}
          onClick={() => handleSort('school')}
        >
          {t('headerField.school')}
          {getSortIcon('school')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('level')}>
          {t('headerField.level')}
          {getSortIcon('level')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('star')}>
          {t('headerField.rank')}
          {getSortIcon('star')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('uwLevel')}>
          {t('headerField.ueLevel')}
          {getSortIcon('uwLevel')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('affection')}>
          {t('headerField.affection')}
          {getSortIcon('affection')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('affectionExp')}>
          {t('headerField.experience')}
          {getSortIcon('affectionExp')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetLevel')}>
          {t('headerField.level')}
          {getSortIcon('targetLevel')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetStar')}>
          {t('headerField.rank')}
          {getSortIcon('targetStar')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetUwLevel')}>
          {t('headerField.ueLevel')}
          {getSortIcon('targetUwLevel')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetAffection')}>
          {t('headerField.affection')}
          {getSortIcon('targetAffection')}
        </th>
        {SKILLS.map((s) => (
          <th key={`ch-${s}`} className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort(s)}>
            {SKILL_LABELS[SKILLS.indexOf(s)]}
            {getSortIcon(s)}
          </th>
        ))}
        {SKILLS.map((s) => (
          <th key={`th-${s}`} className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort(s)}>
            {SKILL_LABELS[SKILLS.indexOf(s)]}
            {getSortIcon(s)}
          </th>
        ))}
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('currentEquipment0')}>
          {t('headerField.equipment1')}
          {getSortIcon('currentEquipment0')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('currentEquipment1')}>
          {t('headerField.equipment2')}
          {getSortIcon('currentEquipment1')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('currentEquipment2')}>
          {t('headerField.equipment3')}
          {getSortIcon('currentEquipment2')}
        </th>
        <th className={`${hField} bg-blue-50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20`} onClick={() => handleSort('currentGear')}>
          {t('headerField.bondGear')}
          {getSortIcon('currentGear')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetEquipment0')}>
          {t('headerField.equipment1')}
          {getSortIcon('targetEquipment0')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetEquipment1')}>
          {t('headerField.equipment2')}
          {getSortIcon('targetEquipment1')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetEquipment2')}>
          {t('headerField.equipment3')}
          {getSortIcon('targetEquipment2')}
        </th>
        <th className={`${hField} bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20`} onClick={() => handleSort('targetGear')}>
          {t('headerField.bondGear')}
          {getSortIcon('targetGear')}
        </th>
        <th className={`${hField} bg-purple-50 dark:bg-purple-900/10`}>{t('headerField.acquiredDate')}</th>
        <th className={`${hField} bg-purple-50 dark:bg-purple-900/10`}>{t('headerField.useEligma')}</th>
        <th className={`${hField} bg-purple-50 dark:bg-purple-900/10`}>{t('headerField.eligmaPrice')}</th>
        <th className={`${hField} bg-purple-50 dark:bg-purple-900/10`}>{t('headerField.eligmaStock')}</th>
        <th className={`${hField} bg-purple-50 dark:bg-purple-900/10`}></th>
      </tr>
    </thead>
  );
}

export const SKILLS_EXPORT = SKILLS;
