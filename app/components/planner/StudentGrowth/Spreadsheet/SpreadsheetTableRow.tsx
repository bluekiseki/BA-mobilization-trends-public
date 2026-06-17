import { memo, useCallback } from 'react';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import { CustomNumberInput } from '~/components/CustomInput';
import { affectionExpToNextLevel } from '~/data/growthData';
import { NumInput, EquipmentInput, GearInput } from './SpreadsheetInputCells';
import type { Row } from './spreadsheetSort';
import { useTranslation } from 'react-i18next';

const SKILLS = ['ex', 'normal', 'passive', 'sub'] as const;
const SKILL_MAX: Record<(typeof SKILLS)[number], number> = { ex: 5, normal: 10, passive: 10, sub: 10 };

interface SpreadsheetTableRowProps {
  row: Row;
  rowIndex: number;
  plan: GrowthPlan | null;
  starUwOptions: readonly { label: string; star: number; uw: number }[];
  updatePlan: (uuid: string, field: string, value: unknown, saveUndo?: boolean) => void;
  handleAdd: (studentId: number) => void;
  handleRemove: (uuid: string) => void;
  handleStarUw: (uuid: string, section: 'current' | 'target', idx: number) => void;
  handleEquip: (uuid: string, section: 'current' | 'target', idx: number, val: number, equip: [number, number, number]) => void;
  screenWidth: number;
  hClass: { td: string; inp: string; sel: string; L: { add: number; sel: number; icon: number; name: number; school: number } };
}

function SpreadsheetTableRowComponent({
  row,
  rowIndex,
  plan,
  starUwOptions,
  updatePlan,
  handleAdd,
  handleRemove,
  handleStarUw,
  handleEquip,
  screenWidth,
  hClass: { td, inp, sel, L },
}: SpreadsheetTableRowProps) {
  // console.log('SpreadsheetTableRowComponent',SpreadsheetTableRowComponent)
  const isAdded = plan !== null;
  const rowBg = isAdded ? 'bg-white dark:bg-neutral-900' : 'bg-neutral-50 dark:bg-neutral-950';
  const cellId = useCallback((col: string) => `row-${rowIndex}-${col}`, [rowIndex]);
  const { t } = useTranslation('planner', { keyPrefix: 'spreadsheet' });

  function starUwToIndex(star: number, uw: number): number {
    return uw > 0 ? 4 + uw : Math.max(0, star - 1);
  }

  return (
    <tr className={rowBg}>
      <td className={`${td} sticky z-10 bg-inherit`} style={{ left: L.add, width: 40, minWidth: 40, maxWidth: 40 }}>
        <input
          type="checkbox"
          checked={isAdded}
          onChange={() => {
            if (plan) {
              handleRemove(plan.uuid);
            } else {
              handleAdd(row.studentId);
            }
          }}
          className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
        />
      </td>

      <td className={`${td} sticky z-10 bg-inherit`} style={{ left: L.sel, width: 40, minWidth: 40, maxWidth: 40 }}>
        {plan && (
          <input type="checkbox" checked={plan.isSelected} onChange={() => updatePlan(plan.uuid, 'isSelected', !plan.isSelected)} className="w-3.5 h-3.5 rounded text-emerald-600 cursor-pointer" />
        )}
      </td>

      <td className={`${td} sticky z-10 bg-inherit`} style={{ left: L.icon, width: 32, minWidth: 32, maxWidth: 32 }}>
        {row.portrait ? (
          <img src={`data:image/webp;base64,${row.portrait}`} alt={row.name} className="w-8 h-8 rounded object-cover" />
        ) : (
          <div className="w-8 h-8 rounded bg-neutral-200 dark:bg-neutral-700" />
        )}
      </td>

      <td
        className={`${td} sticky z-10 bg-inherit pl-2 text-left font-medium truncate ${isAdded ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}
        style={{ left: L.name, width: screenWidth > 600 ? 120 : 0, minWidth: screenWidth > 600 ? 120 : 0, maxWidth: screenWidth > 600 ? 120 : 0 }}
        title={row.name}
      >
        {row.name}
      </td>

      <td
        className={`${td} sticky z-10 bg-inherit pl-1 text-left truncate text-neutral-500 dark:text-neutral-400 whitespace-nowrap`}
        style={{ left: L.school, width: screenWidth > 600 ? 70 : 0, minWidth: screenWidth > 600 ? 70 : 0, maxWidth: screenWidth > 600 ? 70 : 0 }}
      >
        {row.school}
      </td>

      {plan ? (
        <>
          <NumInput plan={plan} section="current" field="level" value={plan.current.level} min={1} max={90} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('level')} />
          <td className={td}>
            <select value={starUwToIndex(plan.current.star, plan.current.uw)} onChange={(e) => handleStarUw(plan.uuid, 'current', +e.target.value)} className={sel}>
              {starUwOptions.map((opt, i) => (
                <option key={i} value={i} disabled={opt.uw === 0 && opt.star < row.minStar}>
                  {opt.label}
                </option>
              ))}
            </select>
          </td>
          <NumInput
            plan={plan}
            section="current"
            field="uwLevel"
            value={plan.current.uwLevel}
            min={1}
            max={60}
            disabled={plan.current.uw === 0}
            updatePlan={updatePlan}
            td={td}
            inp={inp}
            cellId={cellId('uwLevel')}
          />
          <NumInput plan={plan} section="current" field="affection" value={plan.current.affection} min={1} max={100} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('affection')} />
          <NumInput
            plan={plan}
            section="current"
            field="affectionExp"
            value={plan.current.affectionExp}
            min={0}
            max={affectionExpToNextLevel[plan.current.affection] || 1}
            updatePlan={updatePlan}
            td={td}
            inp={inp}
            cellId={cellId('affectionExp')}
          />

          <NumInput plan={plan} section="target" field="level" value={plan.target.level} min={1} max={90} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('targetLevel')} />
          <td className={td}>
            <select value={starUwToIndex(plan.target.star, plan.target.uw)} onChange={(e) => handleStarUw(plan.uuid, 'target', +e.target.value)} className={sel}>
              {starUwOptions.map((opt, i) => (
                <option key={i} value={i} disabled={opt.uw === 0 && opt.star < row.minStar}>
                  {opt.label}
                </option>
              ))}
            </select>
          </td>
          <NumInput
            plan={plan}
            section="target"
            field="uwLevel"
            value={plan.target.uwLevel}
            min={1}
            max={60}
            disabled={plan.target.uw === 0}
            updatePlan={updatePlan}
            td={td}
            inp={inp}
            cellId={cellId('targetUwLevel')}
          />
          <NumInput plan={plan} section="target" field="affection" value={plan.target.affection} min={1} max={100} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('targetAffection')} />

          {SKILLS.map((s) => (
            <NumInput
              key={`c-${s}`}
              plan={plan}
              section="current"
              field={s}
              value={plan.current[s]}
              min={1}
              max={SKILL_MAX[s]}
              updatePlan={updatePlan}
              td={td}
              inp={inp}
              cellId={cellId(`current-${s}`)}
            />
          ))}

          {SKILLS.map((s) => (
            <NumInput
              key={`t-${s}`}
              plan={plan}
              section="target"
              field={s}
              value={plan.target[s]}
              min={1}
              max={SKILL_MAX[s]}
              updatePlan={updatePlan}
              td={td}
              inp={inp}
              cellId={cellId(`target-${s}`)}
            />
          ))}

          {([0, 1, 2] as const).map((i) => (
            <EquipmentInput
              key={`ceq-${i}`}
              plan={plan}
              section="current"
              index={i}
              value={plan.current.equipment[i]}
              handleEquip={handleEquip}
              equip={plan.current.equipment}
              td={td}
              inp={inp}
              cellId={cellId(`currentEquipment${i}`)}
            />
          ))}
          {row.hasGear ? (
            <GearInput plan={plan} section="current" value={plan.current.gear} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('currentGear')} />
          ) : (
            <td className={td} data-cell-id={cellId('currentGear')}>
              <span className="text-neutral-300 dark:text-neutral-600">-</span>
            </td>
          )}

          {([0, 1, 2] as const).map((i) => (
            <EquipmentInput
              key={`teq-${i}`}
              plan={plan}
              section="target"
              index={i}
              value={plan.target.equipment[i]}
              handleEquip={handleEquip}
              equip={plan.target.equipment}
              td={td}
              inp={inp}
              cellId={cellId(`targetEquipment${i}`)}
            />
          ))}
          {row.hasGear ? (
            <GearInput plan={plan} section="target" value={plan.target.gear} updatePlan={updatePlan} td={td} inp={inp} cellId={cellId('targetGear')} />
          ) : (
            <td className={td} data-cell-id={cellId('targetGear')}>
              <span className="text-neutral-300 dark:text-neutral-600">-</span>
            </td>
          )}

          <td className={td}>
            <input
              type="text"
              value={plan.acquiredDate || ''}
              placeholder="YYYY-MM-DD"
              className={inp}
              onChange={() => {}}
              onBlur={(e) => updatePlan(plan.uuid, 'acquiredDate', e.target.value || null)}
            />
          </td>

          <td className={td}>
            <input
              type="checkbox"
              checked={plan.useEligmaForStar}
              onChange={() => updatePlan(plan.uuid, 'useEligmaForStar', !plan.useEligmaForStar)}
              className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
            />
          </td>

          <td className={td}>
            {plan.useEligmaForStar && (
              <CustomNumberInput
                value={plan.eligmaInfo?.price ?? null}
                min={0}
                max={5}
                className={inp}
                onChange={(val) => {
                  if (val !== null) updatePlan(plan.uuid, 'eligmaInfo', { ...plan.eligmaInfo, price: val });
                }}
              />
            )}
          </td>

          <td className={td}>
            {plan.useEligmaForStar && (
              <CustomNumberInput
                value={plan.eligmaInfo?.stock ?? null}
                min={0}
                max={20}
                className={inp}
                onChange={(val) => {
                  if (val !== null) updatePlan(plan.uuid, 'eligmaInfo', { ...plan.eligmaInfo, stock: val });
                }}
              />
            )}
          </td>

          <td className={td}></td>
        </>
      ) : (
        <td colSpan={30} className="border-b border-neutral-100 dark:border-neutral-800 text-center text-neutral-300 dark:text-neutral-700 italic py-1">
          {t('messages.addPlanHint')}
        </td>
      )}
    </tr>
  );
}

function arePropsEqual(prev: SpreadsheetTableRowProps, next: SpreadsheetTableRowProps) {
  const planEqual =
    prev.row.studentId === next.row.studentId &&
    // prev.plan === next.plan &&
    JSON.stringify(prev.plan) == JSON.stringify(next.plan) &&
    prev.screenWidth === next.screenWidth;
  if (planEqual) return true;
  // console.log('[TableRow] memo check:', {prev, next}, prev.row.studentId === next.row.studentId ,
  // prev.plan?.uuid === next.plan?.uuid ,
  // prev.plan?.uuid === next.plan?.uuid ,
  // JSON.stringify(prev.plan) == JSON.stringify(next.plan),
  // prev.screenWidth === next.screenWidth);
  return false;
}

export const SpreadsheetTableRow = memo(SpreadsheetTableRowComponent, arePropsEqual);
