import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive action. */
  danger?: boolean;
  /** Disables both actions and blocks dismissal while an async confirm action is running. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Generic reusable confirm dialog — replaces ad hoc window.confirm() calls. */
export function ConfirmDialog({ open, message, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation('ui');
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-neutral-800 dark:text-neutral-100">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition disabled:opacity-50"
          >
            {cancelLabel ?? t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-3 py-1.5 text-xs font-medium rounded transition disabled:opacity-50 ${
              danger ? 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300' : 'text-blue-600 dark:text-blue-400 hover:text-blue-700'
            }`}
          >
            {confirmLabel ?? t('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
