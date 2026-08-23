import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { RiArrowRightLine } from 'react-icons/ri';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import type { NoticesResponse } from '~/types/notices';
import { NoticeListItem } from '~/components/NoticeListItem';

export const LOCALE_DEFAULT_REGION: Record<Locale, string> = {
  ko: 'KR',
  ja: 'JP',
  'zh-Hant': 'TW',
  en: 'Global',
};

function isNoticesResponse(value: unknown): value is NoticesResponse {
  return typeof value === 'object' && value !== null && 'data' in value && Array.isArray(value.data);
}

export function NoticeWidget() {
  const { t, i18n } = useTranslation('notices');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;

  const [region, setRegion] = useState(() => LOCALE_DEFAULT_REGION[locale] ?? 'ALL');
  const [sort, setSort] = useState('new');
  const [postType, setPostType] = useState('ALL');
  const [notices, setNotices] = useState<NoticesResponse['data']>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/notices?region=${region}&sort=${sort}&type=${postType}&limit=5`;

    setIsLoading(true);
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load notices: ${response.status}`);
        const payload: unknown = await response.json();
        if (!isNoticesResponse(payload)) throw new Error('Invalid notices response');
        setNotices(payload.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load notices:', error);
        setNotices([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [region, sort, postType]);

  const servers = [
    { id: 'ALL', label: t('servers.ALL') },
    { id: 'Global', label: t('servers.Global') },
    { id: 'KR', label: t('servers.KR') },
    { id: 'JP', label: t('servers.JP') },
    { id: 'TW', label: t('servers.TW') },
  ];

  const types = [
    { id: 'ALL', label: t('types.ALL') },
    { id: 'VIDEO', label: t('types.VIDEO') },
    { id: 'ETC', label: t('types.ETC') },
  ];

  return (
    <div className="w-full border-y md:border md:rounded-xl border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col border-b border-neutral-100 dark:border-neutral-700 px-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Server Tab */}
        <div className="flex">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setRegion(s.id)}
              className={`px-2.5 py-2.5 text-xs font-bold border-b-2 transition-all ${
                region === s.id
                  ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                  : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Type + Sort */}
        <div className="flex items-center gap-2 shrink-0 pb-2 sm:pb-0">
          <div className="flex gap-0.5">
            {types.map((type) => (
              <button
                key={type.id}
                onClick={() => setPostType(type.id)}
                className={`px-2 py-0.5 text-xs font-bold rounded transition-all ${
                  postType === type.id
                    ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900'
                    : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs ios-compact-12 font-bold text-neutral-400 dark:text-neutral-500 bg-transparent outline-none cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <option value="new">{t('sort.new')}</option>
            <option value="modified">{t('sort.modified')}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className={`divide-y divide-neutral-50 dark:divide-neutral-700 transition-opacity ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
        {notices.length > 0 ? (
          notices.map((post) => <NoticeListItem key={post.post_id} post={post} to={localeLink(locale, `/notices/${post.post_id}`)} sort={sort} locale={locale} variant="widget" />)
        ) : (
          <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-600">{isLoading ? t_ui('loading') : t('noResults')}</div>
        )}
      </div>

      {/* Footer */}
      <Link
        to={localeLink(locale, '/notices')}
        className="flex items-center justify-center gap-1 py-2.5 text-sm font-bold text-neutral-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 border-t border-neutral-100 dark:border-neutral-700 transition-colors group"
      >
        {t('viewAll')}
        <RiArrowRightLine size={12} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
