import { useEffect, useCallback } from 'react';

interface UseSpreadsheetKeydownOptions {
  cellId: string | undefined;
  maxValue: number;
  minValue: number;
  onMax: () => void;
  onCopyFromAbove: (value: string) => void;
  deps: unknown[];
}

export function useSpreadsheetKeydown({ cellId, maxValue, minValue, onMax, onCopyFromAbove, onUndo, deps }: UseSpreadsheetKeydownOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onMax();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const input = e.target as HTMLInputElement;
        const tr = input.closest('tr');
        const nextTr = tr?.nextElementSibling as HTMLElement | null;
        setTimeout(() => {
          if (nextTr && cellId) {
            const columnName = cellId.replace(/^row-\d+-/, '');
            const nextInput = nextTr.querySelector(`[data-cell-id*="-${columnName}"] input`) as HTMLInputElement;
            if (nextInput) {
              const blockKeyUp = (ev: KeyboardEvent) => {
                if (ev.key === 'Enter') ev.stopPropagation();
                nextInput.removeEventListener('keyup', blockKeyUp, true);
              };
              nextInput.addEventListener('keyup', blockKeyUp, true);
              nextInput.focus();
            }
          }
        }, 0);
      } else if (e.metaKey && e.key === 'd') {
        e.preventDefault();
        const input = e.target as HTMLInputElement;
        const tr = input.closest('tr');
        const prevTr = tr?.previousElementSibling as HTMLElement | null;
        if (prevTr && cellId) {
          const columnName = cellId.replace(/^row-\d+-/, '');
          const prevInput = prevTr.querySelector(`[data-cell-id*="-${columnName}"] input`) as HTMLInputElement;
          if (prevInput) {
            const prevValue = prevInput.value;
            const num = parseInt(prevValue, 10);
            if (!isNaN(num)) {
              const clampedVal = Math.max(minValue, Math.min(maxValue, num));
              onCopyFromAbove(String(clampedVal));
            }
          }
        }
      }
    },
    [cellId, maxValue, minValue, onMax, onCopyFromAbove],
  );

  useEffect(() => {
    const tdElement = document.querySelector(`[data-cell-id="${cellId}"]`) as HTMLElement;
    if (!tdElement) return;
    const input = tdElement.querySelector('input') as HTMLInputElement;
    if (!input) return;
    input.addEventListener('keydown', handleKeyDown);
    return () => input.removeEventListener('keydown', handleKeyDown);
  }, [cellId, handleKeyDown, ...deps]);
}
