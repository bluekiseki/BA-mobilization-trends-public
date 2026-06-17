import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { validateUsernameRaw, filterPrintableAscii } from '~/utils/authHash';
import { PASSWORD_MIN_SCORE } from '~/utils/passwordValidate';
import { PasswordStrengthInput, usePasswordScore } from './PasswordStrengthInput.client';
import { UsernameField, useUsernameField } from './UsernameField';
import { ConfirmPasswordField } from './ConfirmPasswordField';

interface Props {
  mode: 'change' | 'set';
  storedUsername?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ChangePasswordForm({ mode, storedUsername, onSuccess, onCancel }: Props) {
  const { t } = useTranslation('auth');
  const { username, usernameError, handleUsernameChange } = useUsernameField(mode === 'change' ? (storedUsername ?? '') : '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordScore = usePasswordScore(newPassword, [username]);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    const validationTarget = mode === 'set' ? username : (storedUsername ?? '');
    const usernameValidation = validateUsernameRaw(validationTarget);
    if (usernameValidation) {
      setError(usernameValidation);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('common.passwordsMismatch'));
      return;
    }
    if (passwordScore !== null && passwordScore < PASSWORD_MIN_SCORE) {
      setError(t('common.passwordTooWeak'));
      return;
    }

    setIsLoading(true);

    const submit = async () => {
      interface ApiResponse {
        message?: string;
        error?: string;
      }

      try {
        if (mode === 'change') {
          if (storedUsername && username.toLowerCase() !== storedUsername.toLowerCase()) {
            setError(t('passwordForm.errors.usernameMismatch'));
            setIsLoading(false);
            return;
          }
          const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          if (!res.ok) {
            const data: ApiResponse = await res.json();
            throw new Error(data?.error || data?.message || t('passwordForm.errors.failedToChangePassword'));
          }
        } else {
          const res = await fetch('/api/auth-ext?op=link-credential', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: newPassword }),
          });
          if (!res.ok) {
            const data: ApiResponse = await res.json();
            const serverError = data?.error || data?.message;
            const msg = serverError === 'Username already taken' ? t('common.usernameTaken') : serverError || t('passwordForm.errors.failedToSetPassword');
            throw new Error(msg);
          }
        }

        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('passwordForm.errors.operationFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    void submit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-3">
      {mode === 'set' ? (
        <UsernameField value={username} error={usernameError} onChange={handleUsernameChange} compact label={t('passwordForm.chooseUsername')} placeholder={t('passwordForm.yourUsername')} />
      ) : (
        <div>
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">{t('passwordForm.yourUsername')}</label>
          <input
            type="text"
            value={storedUsername ?? ''}
            readOnly
            className="w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400"
            autoComplete="username"
          />
        </div>
      )}

      {mode === 'change' && (
        <div>
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">{t('passwordForm.currentPassword')}</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(filterPrintableAscii(e.target.value))}
            required
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
      )}

      <PasswordStrengthInput value={newPassword} onChange={setNewPassword} userInputs={[username]} label={t('passwordForm.newPassword')} autoComplete="new-password" />

      <ConfirmPasswordField value={confirmPassword} onChange={setConfirmPassword} compact label={t('passwordForm.confirmNewPassword')} />

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-1.5 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isLoading || (mode === 'set' ? !username || !!usernameError : !storedUsername) || (passwordScore !== null && passwordScore < PASSWORD_MIN_SCORE)}
          className="flex-1 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white font-medium rounded-md transition"
        >
          {isLoading ? t('common.saving') : mode === 'change' ? t('passwordForm.changePassword') : t('passwordForm.setPassword')}
        </button>
      </div>
    </form>
  );
}
