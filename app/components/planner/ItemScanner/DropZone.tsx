import { useRef, useState } from 'react';
import { FaCloudUploadAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface Props {
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

export function DropZone({ disabled, onFiles }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: 'itemScanner' });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || disabled) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length > 0) onFiles(arr);
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={[
        'flex flex-col items-center justify-center gap-2 sm:gap-3 border-2 border-dashed py-6 px-4 sm:py-10 sm:px-6 transition-colors',
        disabled
          ? 'border-neutral-300 dark:border-neutral-700 cursor-not-allowed opacity-50'
          : dragging
            ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30 cursor-copy'
            : 'border-neutral-400 dark:border-neutral-600 hover:border-neutral-600 dark:hover:border-neutral-400 cursor-pointer',
      ].join(' ')}
    >
      <FaCloudUploadAlt className="text-4xl text-neutral-500" />
      <div className="text-center">
        <p className="font-medium text-neutral-700 dark:text-neutral-300">{disabled ? t('dropZoneDisabled') : t('dropZoneInstructions')}</p>
        {!disabled && <p className="text-sm text-neutral-500 mt-1">{t('dropZoneBrowse')}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={disabled} />
    </div>
  );
}
