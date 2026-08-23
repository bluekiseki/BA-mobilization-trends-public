import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { RaidInfo } from '~/types/data';
import type { PortraitData, StudentData } from '~/components/dashboard/common';
import { VideoPageView } from '~/components/dashboard/video/VideoPageView';
import { isTotalAssault } from '~/components/dashboard/common';
import { localeLink } from '~/utils/localeLink';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { type_translation, typecolor } from '~/components/raid/raidToString';

export function LiveVideoSection({ raidInfos, studentData, portraitData }: { raidInfos: RaidInfo[]; studentData: StudentData; portraitData: PortraitData }) {
  const { t, i18n } = useTranslation('liveDashboard');
  const { t: t_d } = useTranslation('dashboard');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const localeShort = getLocaleShortName(locale);
  const isEraid = !isTotalAssault(raidInfos[0]);
  const eraidTypes = useMemo(() => raidInfos.map((info) => info.Type).filter((type): type is NonNullable<RaidInfo['Type']> => type !== undefined), [raidInfos]);
  const [selectedType, setSelectedType] = useState<string>(isEraid ? (eraidTypes[0] ?? 'All') : 'All');

  useEffect(() => {
    if (!isEraid) {
      setSelectedType('All');
      return;
    }

    if (eraidTypes.length === 0) {
      setSelectedType('All');
      return;
    }

    if (!eraidTypes.includes(selectedType as NonNullable<RaidInfo['Type']>)) {
      setSelectedType(eraidTypes[0]);
    }
  }, [eraidTypes, isEraid, selectedType]);

  const activeTab = isEraid ? selectedType : 'All';
  const selectedRaidInfo = isEraid && selectedType !== 'All' ? (raidInfos.find((info) => info.Type === selectedType) ?? raidInfos[0]) : raidInfos[0];

  return (
    <section className="border-t border-neutral-200 dark:border-neutral-700 pt-8 space-y-4">
      <h2 className="text-2xl font-bold">
        {t_ui('clearVideos')}
        <span className="ml-2 text-sm font-normal text-neutral-500 dark:text-neutral-400">(Experimental)</span>
      </h2>

      <ul className="text-sm text-neutral-500 dark:text-neutral-400 space-y-1 list-disc list-inside">
        <li>{t_d('videos_missing_note')}</li>
        <li>{t('video_fallback_note_crawl')}</li>
        <li>{t_d('video_extraction_note')}</li>
        <li>
          {t('video_fallback_note_live_only')}{' '}
          <Link to={localeLink(locale, '/dashboard/jp/videos')} className="text-blue-600 dark:text-blue-400 underline">
            {t_d('videos_view_all')}
          </Link>
        </li>
      </ul>

      {isEraid && eraidTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {eraidTypes.map((type) => {
            const isActive = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isActive ? 'text-neutral-950 dark:text-neutral-950 border-transparent' : 'border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200'
                }`}
                style={isActive ? { backgroundColor: typecolor[type] } : undefined}
              >
                {type_translation[type][localeShort]}
              </button>
            );
          })}
        </div>
      )}

      <VideoPageView raidInfo={selectedRaidInfo} server="jp" portraitData={portraitData} studentData={studentData} isGrandAssault={isEraid} activeTab={activeTab} />
    </section>
  );
}
