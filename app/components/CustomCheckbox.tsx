// app/components/CustomCheckbox.tsx
import { useEffect, useRef } from 'react';

export const CustomCheckbox = ({
  state,
  ...props
}: {
  state: 'checked' | 'unchecked' | 'indeterminate';
} & React.InputHTMLAttributes<HTMLInputElement>) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'indeterminate';
      ref.current.checked = state === 'checked';
    }
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 rounded-sm border-gray-300 dark:border-neutral-600 text-teal-600 focus:ring-teal-500"
      // checked={true} only when in 'checked' state
      // checked={false} when 'indicatorminate' or 'unchecked' state
      checked={state === 'checked'}
      {...props}
    />
  );
};
