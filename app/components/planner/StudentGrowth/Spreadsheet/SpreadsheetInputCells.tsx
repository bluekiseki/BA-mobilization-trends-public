import { useEffect, useState, useCallback, memo } from 'react';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import { CustomNumberInput } from '~/components/CustomInput';
import { useSpreadsheetKeydown } from './hooks/useSpreadsheetKeydown';

interface NumInputProps {
  plan: GrowthPlan;
  section: 'current' | 'target';
  field: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  updatePlan: (uuid: string, field: string, value: any, saveUndo?: boolean) => void;
  td: string;
  inp: string;
  cellId?: string;
}

function NumInputComponent({ plan, section, field, value, min, max, disabled, updatePlan, td, inp, cellId }: NumInputProps) {
  const [displayValue, setDisplayValue] = useState(String(value));

  useEffect(() => {
    const actualValue = (plan[section] as any)[field];
    setDisplayValue(String(actualValue));
  }, [plan, section, field]);

  const isValidValue = useCallback(
    (newVal: number) => {
      if (section !== 'target') return true;
      const currentVal = (plan.current as any)[field];
      return newVal >= currentVal;
    },
    [plan, section, field],
  );

  useSpreadsheetKeydown({
    cellId,
    maxValue: max,
    minValue: min,
    onMax: () => {
      if (isValidValue(max)) {
        setDisplayValue(String(max));
        updatePlan(plan.uuid, `${section}.${field}`, max);
      }
    },
    onCopyFromAbove: (clampedVal) => {
      const num = parseInt(clampedVal, 10);
      if (!isNaN(num) && isValidValue(num)) {
        setDisplayValue(clampedVal);
        updatePlan(plan.uuid, `${section}.${field}`, num);
      }
    },
    deps: [max, min, plan, section, field, disabled, updatePlan, isValidValue],
  });

  return (
    <td className={td} data-cell-id={cellId}>
      <CustomNumberInput
        value={parseInt(displayValue, 10) || null}
        min={min}
        max={max}
        disabled={disabled}
        className={inp}
        onChange={(val) => {
          if (val !== null) setDisplayValue(String(val));
        }}
        onBlur={() => {
          const val = parseInt(displayValue, 10);
          // console.log(`[NumInput.onBlur] ${section}.${field}: displayValue=${displayValue}, parsed=${val}, min=${min}, max=${max}`);
          if (!isNaN(val)) {
            const clampedVal = Math.max(min, Math.min(max, val));
            // console.log(`[NumInput.onBlur] Calling updatePlan with clampedVal=${clampedVal}`);
            updatePlan(plan.uuid, `${section}.${field}`, clampedVal);
          } else {
            setDisplayValue(String(value));
          }
        }}
      />
      <span className="sr-only">{displayValue}</span>
    </td>
  );
}

export const NumInput = memo(NumInputComponent);

interface EquipmentInputProps {
  plan: GrowthPlan;
  section: 'current' | 'target';
  index: number;
  value: number;
  handleEquip: (uuid: string, section: 'current' | 'target', idx: number, val: number, equip: [number, number, number]) => void;
  equip: [number, number, number];
  td: string;
  inp: string;
  cellId?: string;
}

function EquipmentInputComponent({ plan, section, index, value, handleEquip, equip, td, inp, cellId }: EquipmentInputProps) {
  const [displayValue, setDisplayValue] = useState(String(value));
  // console.log('[EquipmentInputComponent]', { plan, section, index, value, handleEquip, equip, td, inp, cellId })

  useEffect(() => {
    const actualValue = plan[section].equipment[index];
    setDisplayValue(String(actualValue));
  }, [plan, section, index]);

  const isValidValue = useCallback(
    (newVal: number) => {
      if (section !== 'target') return true;
      const currentVal = plan.current.equipment[index];
      return newVal >= currentVal;
    },
    [plan, section, index],
  );

  useSpreadsheetKeydown({
    cellId,
    maxValue: 10,
    minValue: 0,
    onMax: () => {
      if (isValidValue(10)) {
        setDisplayValue('10');
        handleEquip(plan.uuid, section, index, 10, equip);
      }
    },
    onCopyFromAbove: (clampedVal) => {
      const num = parseInt(clampedVal, 10);
      if (!isNaN(num) && isValidValue(num)) {
        setDisplayValue(clampedVal);
        handleEquip(plan.uuid, section, index, num, equip);
      }
    },
    deps: [plan, section, index, handleEquip, equip, isValidValue],
  });

  return (
    <td className={td} data-cell-id={cellId}>
      <CustomNumberInput
        value={parseInt(displayValue, 10) || null}
        min={0}
        max={10}
        className={inp}
        onChange={(val) => {
          if (val !== null) setDisplayValue(String(val));
        }}
        onBlur={() => {
          const val = parseInt(displayValue, 10);
          if (!isNaN(val)) {
            const clampedVal = Math.max(0, Math.min(10, val));
            // console.log('onBlur',plan, clampedVal)
            handleEquip(plan.uuid, section, index, clampedVal, equip);
          } else {
            setDisplayValue(String(value));
          }
        }}
      />
      <span className="sr-only">{displayValue}</span>
    </td>
  );
}

export const EquipmentInput = memo(
  EquipmentInputComponent /*(prev, next) => {
  return (
    // prev.plan.uuid === next.plan.uuid &&
    prev.plan === next.plan &&
    prev.section === next.section &&
    prev.index === next.index &&
    prev.value === next.value &&
    prev.td === next.td &&
    prev.inp === next.inp &&
    prev.cellId === next.cellId
  );
}*/,
);

interface GearInputProps {
  plan: GrowthPlan;
  section: 'current' | 'target';
  value: number;
  updatePlan: (uuid: string, field: string, value: any, saveUndo?: boolean) => void;
  td: string;
  inp: string;
  cellId?: string;
}

function GearInputComponent({ plan, section, value, updatePlan, td, inp, cellId }: GearInputProps) {
  const [displayValue, setDisplayValue] = useState(String(value));

  useEffect(() => {
    const actualValue = plan[section].gear;
    setDisplayValue(String(actualValue));
  }, [plan, section]);

  const isValidValue = useCallback(
    (newVal: number) => {
      if (section !== 'target') return true;
      return newVal >= plan.current.gear;
    },
    [plan, section],
  );

  useSpreadsheetKeydown({
    cellId,
    maxValue: 2,
    minValue: 0,
    onMax: () => {
      if (isValidValue(2)) {
        setDisplayValue('2');
        updatePlan(plan.uuid, `${section}.gear`, 2);
      }
    },
    onCopyFromAbove: (clampedVal) => {
      const num = parseInt(clampedVal, 10);
      if (!isNaN(num) && isValidValue(num)) {
        setDisplayValue(clampedVal);
        updatePlan(plan.uuid, `${section}.gear`, num);
      }
    },
    deps: [plan, section, updatePlan, isValidValue],
  });

  return (
    <td className={td} data-cell-id={cellId}>
      <CustomNumberInput
        value={parseInt(displayValue, 10) || null}
        min={0}
        max={2}
        className={inp}
        onChange={(val) => {
          if (val !== null) setDisplayValue(String(val));
        }}
        onBlur={() => {
          const val = parseInt(displayValue, 10);
          if (!isNaN(val)) {
            const clampedVal = Math.max(0, Math.min(2, val));
            updatePlan(plan.uuid, `${section}.gear`, clampedVal);
          } else {
            setDisplayValue(String(value));
          }
        }}
      />
      <span className="sr-only">{displayValue}</span>
    </td>
  );
}

export const GearInput = memo(GearInputComponent);
