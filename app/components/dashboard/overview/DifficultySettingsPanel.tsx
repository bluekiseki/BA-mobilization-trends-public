// app/components/dashboard/DifficultySettingsPanel.tsx

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { difficultyInfo, type DifficultyName } from '~/components/raid/Difficulty';

export interface DifficultySetting {
  isVisible: boolean;
  binSize: number; // unit: 10ms
  timeout: number; // unit: 10ms
  showTimeout: boolean;
}

export type DifficultySettings = Record<DifficultyName, DifficultySetting>;

interface DifficultySettingsPanelProps {
  settings: DifficultySettings;
  onChange: (newSettings: DifficultySettings) => void;
}

// Internal unit (10ms) -> Converting to string in mm:ss.ss format
const timeUnitsToMMSS = (units: number): string => {
  if (isNaN(units) || units < 0) return '0:00.00';
  const totalSeconds = units / 100; // 100 units are 1 second
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
};

const mmssToTimeUnits = (mmss: string): number | null => {
  // Regular expressions that validate formats such as mm:ss.ss or m:s.s
  const regex = /^\d{1,2}:\d{1,2}(\.\d{1,2})?$/;
  if (!mmss || !regex.test(mmss)) return null; // Return null if not valid

  const parts = mmss.split(':');
  const totalSeconds = (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);

  return isNaN(totalSeconds) ? null : Math.round(totalSeconds * 100);
};

interface TimeInputProps {
  valueInUnits: number;
  onChangeInUnits: (units: number) => void;
  disabled?: boolean;
}

const TimeInput: React.FC<TimeInputProps> = ({ valueInUnits, onChangeInUnits, disabled }) => {
  const [displayValue, setDisplayValue] = useState(timeUnitsToMMSS(valueInUnits));
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    setDisplayValue(timeUnitsToMMSS(valueInUnits));
    setIsValid(true); // It is considered valid if the value is changed from parents
  }, [valueInUnits]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setDisplayValue(newValue);
    setIsValid(mmssToTimeUnits(newValue) !== null || newValue === '');
    // handleBlur()
  };

  const handleBlur = () => {
    if (displayValue === '') {
      return;
    }

    const totalUnits = mmssToTimeUnits(displayValue);
    if (totalUnits && totalUnits !== null) {
      onChangeInUnits(totalUnits);
      setDisplayValue(timeUnitsToMMSS(totalUnits));
      setIsValid(true);
    } else {
      setIsValid(false);
    }
  };

  const invalidClass = !isValid ? 'border-red-500 ring-1 ring-red-500' : 'dark:border-neutral-600';

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={`w-full p-1 text-center bg-transparent border rounded-md transition-colors ${invalidClass}`}
      disabled={disabled}
      placeholder="mm:ss.sss"
    />
  );
};

export default function DifficultySettingsPanel({ settings, onChange }: DifficultySettingsPanelProps) {
  const { t } = useTranslation('dashboard');
  const { t: t_g } = useTranslation('game');

  const handleSettingChange = (difficulty: DifficultyName, key: keyof DifficultySetting, value: boolean | number) => {
    const newSettings = {
      ...settings,
      [difficulty]: { ...settings[difficulty], [key]: value },
    };
    onChange(newSettings);
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border dark:border-neutral-700 text-sm">
      <div className="grid grid-cols-12 gap-2 font-bold px-2 pb-2 border-b dark:border-neutral-700">
        <div className="col-span-5">{t_g('difficulty')}</div>
        <div className="col-span-3 text-center">{t('headerInterval')}</div>
        <div className="col-span-3 text-center">{t('headerTimeout')}</div>
        <div className="col-span-1 text-center" title={t('headerShowTimeoutTitle')}>
          {t('headerShowTimeoutTitleShort')}
        </div>
      </div>

      <div className="space-y-1 mt-2">
        {difficultyInfo.map(({ name }) => (
          <div key={name} className="grid grid-cols-12 gap-2 items-center px-2 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700/50">
            <label htmlFor={`check-${name}`} className="col-span-5 flex items-center cursor-pointer truncate">
              <input
                type="checkbox"
                id={`check-${name}`}
                checked={settings[name].isVisible}
                onChange={(e) => handleSettingChange(name, 'isVisible', e.target.checked)}
                className="mr-2 h-4 w-4 shrink-0"
              />
              {name}
            </label>
            <div className="col-span-3">
              <TimeInput valueInUnits={settings[name].binSize} onChangeInUnits={(units) => handleSettingChange(name, 'binSize', units)} disabled={!settings[name].isVisible} />
            </div>
            <div className="col-span-3">
              {' '}
              {/* col-span-4 -> col-span-3 */}
              <TimeInput valueInUnits={settings[name].timeout} onChangeInUnits={(units) => handleSettingChange(name, 'timeout', units)} disabled={!settings[name].isVisible} />
            </div>
            {/* Check box to show timeout */}
            <div className="col-span-1 flex justify-center">
              <input
                type="checkbox"
                id={`timeout-check-${name}`}
                checked={settings[name].showTimeout}
                onChange={(e) => handleSettingChange(name, 'showTimeout', e.target.checked)}
                className="h-4 w-4 shrink-0"
                disabled={!settings[name].isVisible}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
