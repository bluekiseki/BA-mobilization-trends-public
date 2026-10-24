import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export type GrowthRangeValue = Readonly<{ current: number; target: number }>;
export type GrowthRangeMark = Readonly<{ value: number; label?: ReactNode }>;

interface GrowthRangeSliderProps {
  label: string;
  currentLabel: string;
  targetLabel: string;
  min: number;
  max: number;
  step?: number;
  value: GrowthRangeValue;
  onChange: (value: GrowthRangeValue) => void;
  disabled?: Partial<Record<'current' | 'target', boolean>>;
  invalid?: Partial<Record<'current' | 'target', boolean>>;
  marks?: readonly GrowthRangeMark[];
  formatValue?: (value: number) => string;
}

type Role = 'current' | 'target';
type Gesture = { pointerId: number; role: Role; kind: 'handle' | 'lane'; startX: number; startY: number; startValue: number; moved: boolean };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const moveGrowthRange = (value: GrowthRangeValue, role: Role, next: number): GrowthRangeValue =>
  role === 'current' ? { current: next, target: Math.max(value.target, next) } : { current: Math.min(value.current, next), target: next };

export function GrowthRangeSlider({ label, currentLabel, targetLabel, min, max, step = 1, value, onChange, disabled, invalid, marks, formatValue = String }: GrowthRangeSliderProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<GrowthRangeValue>(value);
  const [draft, setDraft] = useState<GrowthRangeValue | null>(null);
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const shown = draft ?? value;
  const hasMarkLabels = marks?.some((mark) => mark.label !== undefined) ?? false;
  const showEndpoints = !marks?.length;
  if (!gestureRef.current) draftRef.current = value;

  const percent = (number: number) => (max === min ? 0 : ((clamp(number, min, max) - min) / (max - min)) * 100);
  const xToValue = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || max === min) return min;
    const raw = min + ((clientX - rect.left) / rect.width) * (max - min);
    return clamp(min + Math.round((raw - min) / step) * step, min, max);
  };
  const valueToX = (number: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    return rect ? rect.left + (percent(number) / 100) * rect.width : 0;
  };
  const emit = (role: Role, next: number) => {
    const previous = draftRef.current;
    const candidate = moveGrowthRange(previous, role, next);
    if (candidate.current === previous.current && candidate.target === previous.target) return;
    draftRef.current = candidate;
    setDraft(candidate);
    onChange(candidate);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current || max === min) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-range-handle]');
    const role = (handle?.dataset.rangeHandle as Role | undefined) ?? (event.clientY < event.currentTarget.getBoundingClientRect().top + 44 ? 'current' : 'target');
    if (disabled?.[role]) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      role,
      kind: handle ? 'handle' : 'lane',
      startX: event.clientX,
      startY: event.clientY,
      startValue: draftRef.current[role],
      moved: false,
    };
    setActiveRole(role);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.kind !== 'handle') return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && (Math.abs(dx) < 6 || Math.abs(dy) > Math.abs(dx))) return;
    gesture.moved = true;
    const next = xToValue(valueToX(gesture.startValue) + dx);
    const bounded = gesture.role === 'current' && disabled?.target ? Math.min(next, draftRef.current.target) : next;
    emit(gesture.role, bounded);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'lane' && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) {
      const next = xToValue(event.clientX);
      emit(gesture.role, gesture.role === 'current' && disabled?.target ? Math.min(next, draftRef.current.target) : next);
    } else if (gesture.kind === 'handle' && gesture.moved) {
      const next = xToValue(valueToX(gesture.startValue) + event.clientX - gesture.startX);
      emit(gesture.role, gesture.role === 'current' && disabled?.target ? Math.min(next, draftRef.current.target) : next);
    }
    gestureRef.current = null;
    setDraft(null);
    setActiveRole(null);
  };
  const onPointerCancel = () => {
    gestureRef.current = null;
    setDraft(null);
    setActiveRole(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, role: Role) => {
    if (disabled?.[role] || max === min) return;
    const current = draftRef.current[role];
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + step;
        break;
      case 'PageDown':
        next = current - step * 10;
        break;
      case 'PageUp':
        next = current + step * 10;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    const bounded = clamp(next, min, max);
    emit(role, role === 'current' && disabled?.target ? Math.min(bounded, draftRef.current.target) : bounded);
    setDraft(null);
  };

  const marker = (role: Role): ReactNode => {
    const current = role === 'current';
    const number = shown[role];
    const warning = invalid?.[role];
    const inactive = disabled?.[role] || max === min;
    const tooltipPlacement = percent(number) > 70 ? 'right-full mr-1.5' : 'left-full ml-1.5';
    return (
      <div
        key={role}
        data-range-handle={role}
        role="slider"
        tabIndex={inactive ? -1 : 0}
        aria-label={`${label} ${current ? currentLabel : targetLabel}`}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={current && disabled?.target ? shown.target : max}
        aria-valuenow={number}
        aria-valuetext={formatValue(number)}
        aria-disabled={inactive || undefined}
        onKeyDown={(event) => onKeyDown(event, role)}
        className={`group absolute z-10 flex h-11 w-11 -translate-x-1/2 touch-pan-y ${current ? 'top-0 items-end justify-center pb-0.5' : 'top-11 items-start justify-center pt-0.5'} ${inactive ? 'cursor-not-allowed opacity-40' : 'cursor-ew-resize'} focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-blue-600 dark:focus-visible:outline-blue-300`}
        style={{ left: `${percent(number)}%` }}
      >
        {!inactive && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-sm bg-neutral-800 px-1.5 py-0.5 text-[11px] leading-4 text-white dark:bg-neutral-100 dark:text-neutral-900 ${tooltipPlacement} ${activeRole === role ? 'opacity-100' : 'opacity-0'} group-focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100`}
          >
            {current ? currentLabel : targetLabel} {formatValue(number)}
          </span>
        )}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 30"
          className={`h-[25px] w-5 overflow-visible ${current ? 'fill-white dark:fill-neutral-900' : warning ? 'fill-red-600 dark:fill-red-400' : 'fill-blue-600 dark:fill-blue-400'} ${warning ? 'text-red-600 dark:text-red-400' : current ? 'text-neutral-500 dark:text-neutral-400' : 'text-blue-600 dark:text-blue-400'} group-focus-visible:text-blue-700 dark:group-focus-visible:text-blue-300 ${current ? '' : 'rotate-180'}`}
        >
          <path d="M4 1 H20 Q23 1 23 4 V15 Q23 17 21 18 L12 29 L3 18 Q1 17 1 15 V4 Q1 1 4 1 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    );
  };

  return (
    <div
      className={`relative w-full select-none touch-pan-y ${hasMarkLabels ? 'h-[100px]' : 'h-[88px]'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div ref={railRef} className={`absolute top-0 h-[88px] ${showEndpoints ? 'inset-x-[32px]' : 'inset-x-[22px]'}`}>
        <div className="absolute inset-x-0 top-[42px] h-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
        <div
          className={`absolute top-[42px] h-1 ${invalid?.current || invalid?.target ? 'bg-red-600 dark:bg-red-400' : 'bg-blue-600 dark:bg-blue-400'}`}
          style={{ left: `${percent(shown.current)}%`, width: `${Math.max(0, percent(shown.target) - percent(shown.current))}%` }}
        />
        {marks?.map((mark) => {
          const active = mark.value >= shown.current && mark.value <= shown.target;
          return (
            <span
              key={mark.value}
              aria-hidden="true"
              className={`pointer-events-none absolute top-[40px] h-2 w-2 -translate-x-1/2 rounded-full border-2 ${active ? 'border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400' : 'border-neutral-300 bg-white dark:border-neutral-500 dark:bg-neutral-800'}`}
              style={{ left: `${percent(mark.value)}%` }}
            />
          );
        })}
        {marks?.map((mark) =>
          mark.label === undefined ? null : (
            <span key={`label-${mark.value}`} aria-hidden="true" className="pointer-events-none absolute top-[78px] -translate-x-1/2 whitespace-nowrap" style={{ left: `${percent(mark.value)}%` }}>
              {mark.label}
            </span>
          ),
        )}
        {showEndpoints && (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute right-full top-[36px] mr-3 font-mono text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
              {formatValue(min)}
            </span>
            <span aria-hidden="true" className="pointer-events-none absolute left-full top-[36px] ml-3 font-mono text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
              {formatValue(max)}
            </span>
          </>
        )}
        {marker('current')}
        {marker('target')}
      </div>
    </div>
  );
}
