import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiRotateCcw } from 'react-icons/fi';
import type { StudentReviewRow } from '~/scanner-student/reviewTypes';
import { projectReviewRow, type ReviewImpactItem, type ReviewImpactKey } from '~/scanner-student/reviewImpact';
import type { ReviewOverlayField, StudentCurrent } from '~/scanner-student/types';
import { ReviewInputCell } from './ReviewInputCell';

interface Props {
  rows: StudentReviewRow[];
  onToggleApply: (index: number) => void;
  onEditField: (index: number, field: keyof Omit<StudentCurrent, 'equipment' | 'potential' | 'affectionExp' | 'eleph'>, value: number) => void;
  onEditStarUw: (index: number, star: number, uw: number) => void;
  onEditEquipment: (index: number, slot: number, value: number) => void;
  onEditPotential: (index: number, key: keyof StudentCurrent['potential'], value: number) => void;
  onReset: (index: number) => void;
  onApply: () => void;
}

interface EditConfig {
  label: string;
  min: number;
  max: number;
  select: boolean;
  valuePrefix?: string;
  onCommit: (value: number) => void;
}

const inputClass =
  'h-6 w-full border border-neutral-300 bg-white px-0.5 text-center text-xs text-neutral-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100';
const overlayKey: Record<ReviewOverlayField, ReviewImpactKey> = {
  level: 'level',
  star: 'star',
  uw: 'uw',
  uwLevel: 'uwLevel',
  affection: 'affection',
  ex: 'ex',
  normal: 'normal',
  passive: 'passive',
  sub: 'sub',
  equipment1: 'equipment1',
  equipment2: 'equipment2',
  equipment3: 'equipment3',
  gear: 'gear',
  potentialHp: 'potentialHp',
  potentialAtk: 'potentialAtk',
  potentialHeal: 'potentialHeal',
};
const overlayControlKey: Record<ReviewOverlayField, string> = { ...overlayKey, star: 'grade', uw: 'grade' };
const overlayValuePosition: Record<ReviewOverlayField, string> = {
  level: 'left-0 top-full',
  star: 'right-0 bottom-full',
  affection: 'left-0 bottom-full',
  ex: 'left-1/2 bottom-full -translate-x-1/2',
  normal: 'left-1/2 bottom-full -translate-x-1/2',
  passive: 'left-1/2 bottom-full -translate-x-1/2',
  sub: 'left-1/2 bottom-full -translate-x-1/2',
  uwLevel: 'left-0 top-full',
  uw: 'right-0 bottom-full',
  equipment1: 'left-1/2 top-full -translate-x-1/2',
  equipment2: 'left-1/2 top-full -translate-x-1/2',
  equipment3: 'left-1/2 top-full -translate-x-1/2',
  gear: 'right-0 top-full',
  potentialHp: 'left-0 top-full',
  potentialAtk: 'right-0 top-full',
  potentialHeal: 'right-0 bottom-full',
};

const toGradeIndex = (star: number, uw: number) => (uw > 0 ? 4 + uw : Math.max(0, star - 1));
const isSkillKey = (key: ReviewImpactKey) => key === 'ex' || key === 'normal' || key === 'passive' || key === 'sub';

function formatEditorValue(key: ReviewImpactKey, editor: EditConfig, value: number, emptyLabel: string) {
  if (value === 0) return emptyLabel;
  const formatted = editor.valuePrefix ? `${editor.valuePrefix}${value}` : isSkillKey(key) ? `Lv.${value}` : String(value);
  return isSkillKey(key) && value === editor.max ? `${formatted} MAX` : formatted;
}

function ImpactCell({
  item,
  editor,
  disabled,
  active,
  modified,
  modifiedLabel,
  onActivate,
  onDeactivate,
  currentLabel,
  targetLabel,
  emptyLabel,
}: {
  item: ReviewImpactItem;
  editor: EditConfig;
  disabled: boolean;
  active: boolean;
  modified: boolean;
  modifiedLabel: string;
  onActivate: () => void;
  onDeactivate: () => void;
  currentLabel: string;
  targetLabel: string;
  emptyLabel: string;
}) {
  const currentChanged = item.currentBefore !== item.currentAfter;
  const targetChanged = item.targetBefore !== item.targetAfter;
  const format = (value: number) => formatEditorValue(item.key, editor, value, emptyLabel);
  const currentText = `${currentLabel} ${format(item.currentBefore)}${currentChanged ? `→${format(item.currentAfter)}` : ''}`;
  const targetText = `${targetLabel} ${format(item.targetBefore)}${targetChanged ? `→${format(item.targetAfter)}` : ''}`;

  return (
    <div
      className={`min-w-0 px-0.5 py-1 transition-colors ${active ? 'bg-blue-100 dark:bg-blue-950/60' : ''}`}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocusCapture={onActivate}
      onBlurCapture={onDeactivate}
    >
      <label
        htmlFor={`review-${item.key}`}
        className="block truncate text-xs font-medium leading-4 text-neutral-700 dark:text-neutral-300"
        title={modified ? `${editor.label} · ${modifiedLabel}` : editor.label}
      >
        {editor.label}
        {modified && <span className="text-blue-600 dark:text-blue-400">*</span>}
      </label>
      {editor.select ? (
        <select id={`review-${item.key}`} value={item.scanned ?? ''} disabled={disabled} onFocus={onActivate} onChange={(event) => editor.onCommit(Number(event.target.value))} className={inputClass}>
          <option value="">—</option>
          {Array.from({ length: editor.max - editor.min + 1 }, (_, offset) => editor.min + offset).map((value) => (
            <option key={value} value={value}>
              {format(value)}
            </option>
          ))}
        </select>
      ) : (
        <ReviewInputCell id={`review-${item.key}`} value={item.scanned} min={editor.min} max={editor.max} disabled={disabled} onCommit={editor.onCommit} className={inputClass} />
      )}
      <span
        title={currentText}
        className={`flex items-center gap-1 whitespace-nowrap text-xs leading-4 ${currentChanged ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'}`}
      >
        <span className="w-6 shrink-0 truncate" title={currentLabel}>
          {currentLabel}
        </span>
        {format(item.currentBefore)}
        {currentChanged ? `→${format(item.currentAfter)}` : ''}
      </span>
      <span
        title={targetText}
        className={`flex items-center gap-1 whitespace-nowrap text-xs leading-4 ${targetChanged ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}
      >
        <span className="w-6 shrink-0 truncate" title={targetLabel}>
          {targetLabel}
        </span>
        {format(item.targetBefore)}
        {targetChanged ? `→${format(item.targetAfter)}` : ''}
      </span>
    </div>
  );
}

function ReviewCard({
  row,
  index,
  positionLabel,
  previousDisabled,
  confirmDisabled,
  confirmLabel,
  onPrevious,
  onConfirm,
  onToggleApply,
  onEditField,
  onEditStarUw,
  onEditEquipment,
  onEditPotential,
  onReset,
}: Omit<Props, 'rows' | 'onApply'> & {
  row: StudentReviewRow;
  index: number;
  positionLabel: string;
  previousDisabled: boolean;
  confirmDisabled: boolean;
  confirmLabel: string;
  onPrevious: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('planner', { keyPrefix: 'studentScanner' });
  const { t: tPlanner } = useTranslation(['planner', 'game']);
  const { t: t_ui } = useTranslation('ui');
  const { t: t_g } = useTranslation('game');
  const [activeControl, setActiveControl] = useState<string | null>(null);
  const projection = useMemo(() => projectReviewRow(row), [row]);
  const equipmentLabel = (slot: number) => {
    const type = row.equipmentTypes?.[slot];
    const equipmentNames = {
      Hat: tPlanner('game:equipments.hat'),
      Shoes: tPlanner('game:equipments.shoes'),
      Gloves: tPlanner('game:equipments.gloves'),
      Hairpin: tPlanner('game:equipments.hairpin'),
      Bag: tPlanner('game:equipments.bag'),
      Badge: tPlanner('game:equipments.badge'),
      Watch: tPlanner('game:equipments.watch'),
      Charm: tPlanner('game:equipments.charm'),
      Necklace: tPlanner('game:equipments.necklace'),
    };
    return type
      ? equipmentNames[type]
      : tPlanner(`spreadsheet.headerField.equipment${slot + 1}` as 'spreadsheet.headerField.equipment1' | 'spreadsheet.headerField.equipment2' | 'spreadsheet.headerField.equipment3');
  };
  const config: Record<ReviewImpactKey, EditConfig> = {
    level: { label: t_g('level'), min: 1, max: 90, select: false, onCommit: (value) => onEditField(index, 'level', value) },
    star: { label: t_g('rank'), min: 1, max: 5, select: true, onCommit: (value) => onEditField(index, 'star', value) },
    uw: { label: tPlanner('game:ue'), min: 0, max: 4, select: true, onCommit: (value) => onEditField(index, 'uw', value) },
    uwLevel: { label: tPlanner('spreadsheet.headerField.ueLevel'), min: 1, max: 70, select: false, onCommit: (value) => onEditField(index, 'uwLevel', value) },
    affection: { label: tPlanner('spreadsheet.headerField.affection'), min: 1, max: 100, select: false, onCommit: (value) => onEditField(index, 'affection', value) },
    ex: { label: tPlanner('game:skill.ex'), min: 1, max: 5, select: true, onCommit: (value) => onEditField(index, 'ex', value) },
    normal: { label: tPlanner('game:skill.normal'), min: 1, max: 10, select: true, onCommit: (value) => onEditField(index, 'normal', value) },
    passive: { label: tPlanner('game:skill.passive'), min: 1, max: 10, select: true, onCommit: (value) => onEditField(index, 'passive', value) },
    sub: { label: tPlanner('game:skill.sub'), min: 1, max: 10, select: true, onCommit: (value) => onEditField(index, 'sub', value) },
    equipment1: { label: equipmentLabel(0), min: 0, max: 10, select: true, valuePrefix: 'T', onCommit: (value) => onEditEquipment(index, 0, value) },
    equipment2: { label: equipmentLabel(1), min: 0, max: 10, select: true, valuePrefix: 'T', onCommit: (value) => onEditEquipment(index, 1, value) },
    equipment3: { label: equipmentLabel(2), min: 0, max: 10, select: true, valuePrefix: 'T', onCommit: (value) => onEditEquipment(index, 2, value) },
    gear: { label: t_g('gear'), min: 0, max: 2, select: true, valuePrefix: 'T', onCommit: (value) => onEditField(index, 'gear', value) },
    potentialHp: { label: tPlanner('game:hp'), min: 0, max: 25, select: false, onCommit: (value) => onEditPotential(index, 'hp', value) },
    potentialAtk: { label: tPlanner('game:atk'), min: 0, max: 25, select: false, onCommit: (value) => onEditPotential(index, 'atk', value) },
    potentialHeal: { label: tPlanner('game:heal'), min: 0, max: 25, select: false, onCommit: (value) => onEditPotential(index, 'heal', value) },
  };
  const itemByKey = new Map(projection.items.map((item) => [item.key, item]));
  const detectedValues: Record<ReviewImpactKey, number | null> = {
    level: row.detected.level,
    star: row.detected.star,
    uw: row.detected.uw,
    uwLevel: row.detected.uwLevel,
    affection: row.detected.affection,
    ex: row.detected.ex,
    normal: row.detected.normal,
    passive: row.detected.passive,
    sub: row.detected.sub,
    equipment1: row.detected.equipment[0],
    equipment2: row.detected.equipment[1],
    equipment3: row.detected.equipment[2],
    gear: row.detected.gear,
    potentialHp: row.detected.potential.hp,
    potentialAtk: row.detected.potential.atk,
    potentialHeal: row.detected.potential.heal,
  };
  const starItem = itemByKey.get('star');
  const uwItem = itemByKey.get('uw');
  if (!starItem || !uwItem) return null;
  const gradeOptions = [
    { star: 1, uw: 0, label: tPlanner('spreadsheet.starOptions.star1') },
    { star: 2, uw: 0, label: tPlanner('spreadsheet.starOptions.star2') },
    { star: 3, uw: 0, label: tPlanner('spreadsheet.starOptions.star3') },
    { star: 4, uw: 0, label: tPlanner('spreadsheet.starOptions.star4') },
    { star: 5, uw: 0, label: tPlanner('spreadsheet.starOptions.star5') },
    { star: 5, uw: 1, label: tPlanner('spreadsheet.starOptions.ue1') },
    { star: 5, uw: 2, label: tPlanner('spreadsheet.starOptions.ue2') },
    { star: 5, uw: 3, label: tPlanner('spreadsheet.starOptions.ue3') },
    { star: 5, uw: 4, label: tPlanner('spreadsheet.starOptions.ue4') },
  ];
  const gradeIndex = row.recognized.uw !== null && row.recognized.uw > 0 ? 4 + row.recognized.uw : row.recognized.star !== null ? row.recognized.star - 1 : '';
  const formatGrade = (star: number, uw: number) => gradeOptions[toGradeIndex(star, uw)]?.label ?? '—';
  const gradeCurrentChanged = starItem.currentBefore !== starItem.currentAfter || uwItem.currentBefore !== uwItem.currentAfter;
  const gradeTargetChanged = starItem.targetBefore !== starItem.targetAfter || uwItem.targetBefore !== uwItem.targetAfter;
  const renderItem = (key: ReviewImpactKey) => {
    const item = itemByKey.get(key);
    if (!item) return null;
    return (
      <ImpactCell
        key={key}
        item={item}
        editor={config[key]}
        disabled={!row.apply || row.studentId === null || (key === 'uwLevel' && (row.recognized.uw ?? projection.current.uw) === 0)}
        active={activeControl === key}
        modified={item.scanned !== detectedValues[key]}
        modifiedLabel={tPlanner('spreadsheet.messages.unsavedChanges')}
        onActivate={() => setActiveControl(key)}
        onDeactivate={() => setActiveControl(null)}
        currentLabel={tPlanner('common.current')}
        targetLabel={tPlanner('common.target')}
        emptyLabel={tPlanner('common.tierNone')}
      />
    );
  };
  const focusControl = (field: ReviewOverlayField) => {
    const key = overlayControlKey[field];
    setActiveControl(key);
    document.getElementById(`review-${key}`)?.focus();
  };
  const overlayValue = (field: ReviewOverlayField, value: number | null): string | null => {
    if (value === null) return null;
    if (field === 'star') return `${value}★`;
    if (field === 'uw') return value === 0 ? null : gradeOptions[4 + value].label;
    if (field === 'level' || field === 'uwLevel') return `Lv.${value}`;
    if (field === 'ex' || field === 'normal' || field === 'passive' || field === 'sub') {
      return formatEditorValue(field, config[field], value, tPlanner('common.tierNone'));
    }
    if (field.startsWith('equipment') || field === 'gear') return value === 0 ? null : `T${value}`;
    return String(value);
  };

  return (
    <article className={row.studentId === null ? 'opacity-60' : ''}>
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 py-1 dark:border-neutral-700">
        <div className="flex min-w-0 items-center gap-1.5">
          {row.portrait && <img src={`data:image/webp;base64,${row.portrait}`} alt="" className="h-7 w-7 shrink-0 object-cover" />}
          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100" title={row.name || tPlanner('growthCard.selectStudentPrompt')}>
            {row.name || tPlanner('growthCard.selectStudentPrompt')}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{row.confidence === null ? '—' : `${Math.round(row.confidence * 100)}%`}</span>
        </div>
      </div>
      <div className="grid gap-1 md:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.7fr)]">
        <div className={`relative self-start overflow-hidden bg-black transition-[filter,opacity] ${row.apply ? '' : 'pointer-events-none grayscale opacity-45'}`}>
          <img src={row.previewUrl} alt={row.name} className="max-h-[40dvh] w-full object-contain md:max-h-[54dvh]" />
          {row.reviewOverlay.map((overlay) => {
            const item = itemByKey.get(overlayKey[overlay.field]);
            const key = overlayControlKey[overlay.field];
            const changed = item ? item.currentBefore !== item.currentAfter : false;
            const modified = item ? item.scanned !== detectedValues[item.key] : false;
            const active = activeControl === key;
            const value = overlayValue(overlay.field, item?.scanned ?? null);
            return (
              <button
                key={overlay.field}
                type="button"
                onClick={() => focusControl(overlay.field)}
                onMouseEnter={() => setActiveControl(key)}
                onMouseLeave={() => setActiveControl(null)}
                onFocus={() => setActiveControl(key)}
                onBlur={() => setActiveControl(null)}
                title={`${config[overlayKey[overlay.field]].label}: ${item?.scanned ?? t('notRecognized')}${modified ? ` · ${tPlanner('spreadsheet.messages.unsavedChanges')}` : ''}`}
                className={`absolute transition-colors ${item?.scanned === null ? 'border-dashed' : ''} ${active ? 'z-10 border-2 border-blue-600 bg-blue-600/25 dark:border-blue-400 dark:bg-blue-400/25' : changed ? 'border border-blue-600 bg-blue-600/10 dark:border-blue-400 dark:bg-blue-400/10' : 'border border-neutral-500/70 hover:border-blue-600 dark:border-neutral-300/70 dark:hover:border-blue-400'}`}
                style={{
                  left: `${(overlay.box.x / row.sourceSize.width) * 100}%`,
                  top: `${(overlay.box.y / row.sourceSize.height) * 100}%`,
                  width: `${(overlay.box.width / row.sourceSize.width) * 100}%`,
                  height: `${(overlay.box.height / row.sourceSize.height) * 100}%`,
                }}
              >
                {value !== null && (
                  <span
                    className={`absolute whitespace-nowrap px-0.5 text-xs leading-4 ${active ? 'bg-blue-600 text-white outline outline-blue-200 dark:bg-blue-400 dark:text-neutral-950 dark:outline-blue-700' : 'bg-neutral-950/90 text-white outline outline-neutral-400/70'} ${overlayValuePosition[overlay.field]}`}
                  >
                    {value}
                    {modified && '*'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="self-start">
          <div className="flex items-center justify-between gap-1 border-y border-neutral-200 py-1 dark:border-neutral-700">
            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{positionLabel}</span>
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleApply(index)}
                disabled={row.studentId === null}
                aria-pressed={row.apply}
                className={`border px-2 py-1 text-xs font-semibold text-neutral-900 disabled:opacity-40 ${row.apply ? 'border-ba-btn-blue bg-ba-btn-blue hover:bg-ba-btn-blue-dark' : 'border-ba-btn-gray bg-ba-btn-gray hover:brightness-95'}`}
              >
                {row.apply ? tPlanner('common.include') : tPlanner('common.exclude')}
              </button>
              <button
                type="button"
                onClick={() => onReset(index)}
                disabled={!row.edited}
                title={`${tPlanner('itemScanner.tableScanned')} ${t_ui('reset')}`}
                aria-label={`${tPlanner('itemScanner.tableScanned')} ${t_ui('reset')}`}
                className="border border-neutral-300 p-1.5 text-neutral-700 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-300"
              >
                <FiRotateCcw aria-hidden className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onPrevious}
                disabled={previousDisabled}
                title={t('previousStudent')}
                aria-label={t('previousStudent')}
                className="border border-neutral-300 p-1.5 text-neutral-700 disabled:opacity-40 dark:border-neutral-600 dark:text-neutral-300"
              >
                <FiChevronLeft aria-hidden className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled}
                className="whitespace-nowrap bg-ba-btn-blue px-2 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-ba-btn-blue-dark disabled:opacity-40"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
          <div className={`transition-[filter,opacity] ${row.apply ? '' : 'pointer-events-none grayscale opacity-45'}`}>
            <section aria-label={tPlanner('growthCard.stats')} className="grid grid-cols-4 border-t border-neutral-200 dark:border-neutral-700">
              {renderItem('level')}
              <div
                className={`min-w-0 px-0.5 py-1 transition-colors ${activeControl === 'grade' ? 'bg-blue-100 dark:bg-blue-950/60' : ''}`}
                onMouseEnter={() => setActiveControl('grade')}
                onMouseLeave={() => setActiveControl(null)}
                onFocusCapture={() => setActiveControl('grade')}
                onBlurCapture={() => setActiveControl(null)}
              >
                <label
                  htmlFor="review-grade"
                  title={starItem.scanned !== detectedValues.star || uwItem.scanned !== detectedValues.uw ? tPlanner('spreadsheet.messages.unsavedChanges') : undefined}
                  className="block truncate text-xs font-medium leading-4 text-neutral-700 dark:text-neutral-300"
                >
                  {t_g('rank')}
                  {(starItem.scanned !== detectedValues.star || uwItem.scanned !== detectedValues.uw) && <span className="text-blue-600 dark:text-blue-400">*</span>}
                </label>
                <select
                  id="review-grade"
                  value={gradeIndex}
                  disabled={!row.apply || row.studentId === null}
                  onFocus={() => setActiveControl('grade')}
                  onChange={(event) => {
                    const option = gradeOptions[Number(event.target.value)];
                    onEditStarUw(index, option.star, option.uw);
                  }}
                  className={inputClass}
                >
                  {gradeOptions.map((option, optionIndex) => (
                    <option key={option.label} value={optionIndex}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span
                  title={`${tPlanner('common.current')} ${formatGrade(starItem.currentBefore, uwItem.currentBefore)}${gradeCurrentChanged ? `→${formatGrade(starItem.currentAfter, uwItem.currentAfter)}` : ''}`}
                  className={`flex items-center gap-1 whitespace-nowrap text-xs leading-4 ${gradeCurrentChanged ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                >
                  <span className="w-6 shrink-0 truncate" title={tPlanner('common.current')}>
                    {tPlanner('common.current')}
                  </span>
                  {formatGrade(starItem.currentBefore, uwItem.currentBefore)}
                  {gradeCurrentChanged ? `→${formatGrade(starItem.currentAfter, uwItem.currentAfter)}` : ''}
                </span>
                <span
                  title={`${tPlanner('common.target')} ${formatGrade(starItem.targetBefore, uwItem.targetBefore)}${gradeTargetChanged ? `→${formatGrade(starItem.targetAfter, uwItem.targetAfter)}` : ''}`}
                  className={`flex items-center gap-1 whitespace-nowrap text-xs leading-4 ${gradeTargetChanged ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                >
                  <span className="w-6 shrink-0 truncate" title={tPlanner('common.target')}>
                    {tPlanner('common.target')}
                  </span>
                  {formatGrade(starItem.targetBefore, uwItem.targetBefore)}
                  {gradeTargetChanged ? `→${formatGrade(starItem.targetAfter, uwItem.targetAfter)}` : ''}
                </span>
              </div>
              {renderItem('uwLevel')}
              {renderItem('affection')}
            </section>
            <section aria-label={tPlanner('game:skills')} className="grid grid-cols-4 border-t border-neutral-200 dark:border-neutral-700">
              {(['ex', 'normal', 'passive', 'sub'] as const).map(renderItem)}
            </section>
            <section aria-label={tPlanner('game:equipment')} className="grid grid-cols-4 border-t border-neutral-200 dark:border-neutral-700">
              {(['equipment1', 'equipment2', 'equipment3', 'gear'] as const).map(renderItem)}
            </section>
            <section aria-label={tPlanner('game:potential')} className="grid grid-cols-3 border-y border-neutral-200 dark:border-neutral-700">
              {(['potentialHp', 'potentialAtk', 'potentialHeal'] as const).map(renderItem)}
            </section>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ResultsReviewTable({ rows, onToggleApply, onEditField, onEditStarUw, onEditEquipment, onEditPotential, onReset, onApply }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'studentScanner' });
  const { t: tPlanner } = useTranslation('planner');
  const [activeIndex, setActiveIndex] = useState(0);
  const applyCount = rows.filter((row) => row.apply).length;
  const activeRow = rows[activeIndex];
  useEffect(() => setActiveIndex((index) => Math.min(index, Math.max(0, rows.length - 1))), [rows.length]);
  if (!activeRow) return null;
  const isLast = activeIndex === rows.length - 1;
  const confirm = () => {
    if (isLast) onApply();
    else setActiveIndex((index) => index + 1);
  };
  return (
    <div className="space-y-1">
      <nav aria-label={t('reviewListLabel')} className="flex gap-1 overflow-x-auto py-0.5">
        {rows.map((row, index) => (
          <button
            key={`${row.studentId ?? 'unknown'}-${index}`}
            onClick={() => setActiveIndex(index)}
            title={`${row.name || tPlanner('growthCard.selectStudentPrompt')} · ${row.apply ? tPlanner('common.include') : tPlanner('common.exclude')}`}
            aria-current={index === activeIndex ? 'step' : undefined}
            className={`relative h-8 w-8 shrink-0 overflow-hidden border ${index === activeIndex ? 'border-blue-600 dark:border-blue-400' : 'border-neutral-200 dark:border-neutral-700'} ${row.apply ? '' : 'bg-neutral-200 grayscale dark:bg-neutral-800'}`}
          >
            {row.portrait ? (
              <img src={`data:image/webp;base64,${row.portrait}`} alt="" className={`h-full w-full object-cover ${row.apply ? '' : 'opacity-40'}`} />
            ) : (
              <span className={`text-xs ${row.apply ? '' : 'opacity-40'}`}>{index + 1}</span>
            )}
            {!row.apply && <span aria-hidden className="absolute left-1/2 top-[-20%] h-[140%] w-px -rotate-45 bg-neutral-500 dark:bg-neutral-400" />}
          </button>
        ))}
      </nav>
      <ReviewCard
        row={activeRow}
        index={activeIndex}
        positionLabel={`${activeIndex + 1}/${rows.length}`}
        previousDisabled={activeIndex === 0}
        confirmDisabled={isLast && applyCount === 0}
        confirmLabel={isLast ? `${tPlanner('dataExchange.applyData')} ${applyCount}` : t('confirmNext')}
        onPrevious={() => setActiveIndex((value) => Math.max(0, value - 1))}
        onConfirm={confirm}
        onToggleApply={onToggleApply}
        onEditField={onEditField}
        onEditStarUw={onEditStarUw}
        onEditEquipment={onEditEquipment}
        onEditPotential={onEditPotential}
        onReset={onReset}
      />
    </div>
  );
}
