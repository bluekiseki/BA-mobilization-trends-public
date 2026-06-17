import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useFetcher } from 'react-router';
import { RiArrowRightLine, RiFileLine, RiVideoLine } from 'react-icons/ri';
import type { Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { getRelativeTime } from '~/utils/time';
import type { NoticesResponse } from '~/types/notices';

export const LOCALE_DEFAULT_REGION: Record<Locale, string> = {
  ko: 'KR',
  ja: 'JP',
  'zh-Hant': 'TW',
  en: 'Global',
};

const REGION_COLORS: Record<string, string> = {
  KR: 'text-rose-600 dark:text-rose-400',
  JP: 'text-violet-600 dark:text-violet-400',
  Global: 'text-blue-600 dark:text-blue-400',
  TW: 'text-amber-600 dark:text-amber-400',
};

export function NoticeWidget() {
  const { t, i18n } = useTranslation('notices');
  const locale = i18n.language as Locale;

  const [region, setRegion] = useState(() => LOCALE_DEFAULT_REGION[locale] ?? 'ALL');
  const [sort, setSort] = useState('new');
  const [postType, setPostType] = useState('ALL');
  const fetcher = useFetcher();

  useEffect(() => {
    void fetcher.load(`/api/notices?region=${region}&sort=${sort}&type=${postType}&limit=5`);
  }, [region, sort, postType]);

  const notices = (fetcher.data as NoticesResponse | undefined)?.data || [];
  const isLoading = fetcher.state === 'loading';

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
            className="text-xs font-bold text-neutral-400 dark:text-neutral-500 bg-transparent outline-none cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <option value="new">{t('sort.new')}</option>
            <option value="modified">{t('sort.modified')}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className={`divide-y divide-neutral-50 dark:divide-neutral-700 transition-opacity ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
        {notices.length > 0 ? (
          notices.map((post) => (
            <Link
              key={post.post_id}
              to={localeLink(locale, `/notices/${post.post_id}`)}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-700/60 transition-colors group"
            >
              {/* Thumbnail */}
              <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-700">
                {post.thumbnail ? (
                  <img src={post.thumbnail} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <RiFileLine size={14} className="text-neutral-300 dark:text-neutral-700" />
                  </div>
                )}
                {post.type === 'VIDEO' && (
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-0.5 py-0.5">
                    <RiVideoLine size={8} className="text-white" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs font-black uppercase shrink-0 ${REGION_COLORS[post.region] ?? 'text-neutral-400'}`}>{post.region}</span>
                  <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{post.title}</h4>
                </div>
                <p className="text-xs text-neutral-400 dark:text-neutral-600 truncate mt-0.5">{post.category}</p>
              </div>

              {/* Time */}
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap">
                  {sort === 'new' ? getRelativeTime(post.api_create_date, locale) : getRelativeTime(post.api_modify_date, locale)}
                </p>
                <p className="text-[10px] text-neutral-300 dark:text-neutral-700">{sort === 'new' ? t('postedAt') : t('modifiedAt')}</p>
              </div>
            </Link>
          ))
        ) : (
          <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-600">{isLoading ? t('loading') : t('noResults')}</div>
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
