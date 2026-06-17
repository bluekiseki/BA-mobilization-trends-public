import { useTranslation } from 'react-i18next';

interface SimRunButtonProps {
  isRunning: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export const SimRunButton = ({ isRunning, onClick, children, className = '', disabled = false }: SimRunButtonProps) => {
  const { t } = useTranslation('planner');
  return (
    <button onClick={onClick} disabled={isRunning || disabled} className={`flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}>
      {isRunning && <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />}
      {isRunning ? t('button.simRunning') : children}
    </button>
  );
};
