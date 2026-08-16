import { useRef, useState } from 'react';
import { FaCloudUploadAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

interface Props {
  disabled: boolean;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  // Called when the user drops/selects file(s) but none matched `accept` — without this, a
  // rejected file fails completely silently (no callback fires at all).
  onRejected?: (files: File[]) => void;
  translationKeyPrefix?: 'itemScanner' | 'studentScanner';
  // Background media shown behind the drop target while empty (e.g. an example recording) —
  // caller only passes this when it should currently be visible (no file selected yet).
  exampleSrc?: string;
  // `disabled` can be true for several different reasons (models still loading, a scan already
  // running, roster data not fetched yet) — the default message only fits "models not loaded",
  // so callers should override it with the actual reason when disabling for something else.
  disabledLabel?: string;
}

export function DropZone({ disabled, accept, multiple, onFiles, onRejected, translationKeyPrefix = 'itemScanner', exampleSrc, disabledLabel }: Props) {
  const { t } = useTranslation('planner', { keyPrefix: translationKeyPrefix });
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);
  const typePrefix = accept.replace('*', '');
  const showExample = !!exampleSrc && !disabled;

  function handleFiles(files: FileList | null) {
    if (!files || disabled) return;
    const all = Array.from(files);
    // Some containers (e.g. .mkv) report an empty file.type in many browsers/OSes — don't
    // reject those outright, only reject a file whose type is known and clearly wrong.
    const matched = all.filter((f) => f.type === '' || f.type.startsWith(typePrefix));
    if (matched.length > 0) {
      setRejected(false);
      onFiles(matched);
    } else {
      setRejected(true);
      onRejected?.(all);
    }
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
        'relative overflow-hidden flex flex-col items-center justify-center gap-2 sm:gap-3 border-2 border-dashed py-6 px-4 sm:py-10 sm:px-6 transition-colors bg-neutral-50 dark:bg-neutral-800/50',
        disabled
          ? 'border-neutral-300 dark:border-neutral-700 cursor-not-allowed opacity-50'
          : dragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30 cursor-copy'
            : 'border-neutral-400 dark:border-neutral-600 hover:border-neutral-600 dark:hover:border-neutral-400 cursor-pointer',
      ].join(' ')}
    >
      {showExample && <video src={exampleSrc} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover opacity-25 dark:opacity-20" />}
      <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-3">
        <FaCloudUploadAlt className="text-4xl text-neutral-500" />
        <div className="text-center">
          <p className="font-medium text-neutral-700 dark:text-neutral-300">{disabled ? (disabledLabel ?? t('dropZoneDisabled')) : t('dropZoneInstructions')}</p>
          {!disabled && <p className="text-sm text-neutral-500 mt-1">{t('dropZoneBrowse')}</p>}
          {rejected && !disabled && <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{t('unsupportedFile')}</p>}
          {showExample && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">{t('exampleCaption')}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => handleFiles(e.target.files)} disabled={disabled} />
    </div>
  );
}
