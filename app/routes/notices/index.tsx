import { useState, useEffect } from 'react';
import { useFetcher, Link, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RiSearchLine, RiArrowLeftSLine, RiArrowRightSLine, RiVideoLine, RiFileLine } from 'react-icons/ri';
import { getRelativeTime } from '~/utils/time';
import type { Locale } from '~/utils/i18n/config';
import { createMetaDescriptor } from '~/components/head';
import type { Route } from './+types';
import { getInstance } from '~/middleware/i18next';

const REGION_COLORS: Record<string, string> = {
  KR: 'text-rose-600 dark:text-rose-400',
  JP: 'text-violet-600 dark:text-violet-400',
  Global: 'text-blue-600 dark:text-blue-400',
  TW: 'text-amber-600 dark:text-amber-400',
};

export async function loader({ context }: LoaderFunctionArgs) {
  let i18n = getInstance(context);

  return { title: i18n.t('notices:title'), site_title: i18n.t('common:title') };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.site_title, loaderData.title, '/img/1.webp');
}

export default function NoticesIndex() {
  const fetcher = useFetcher();
  const { t, i18n } = useTranslation('notices');
  const locale = i18n.language as Locale;

  const [region, setRegion] = useState('ALL');
  const [sort, setSort] = useState('new');
  const [postType, setPostType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const limit = 20;

  useEffect(() => {
    setPage(1);
  }, [region, sort, postType]);

  useEffect(() => {
    fetcher.load(`/api/notices?region=${region}&sort=${sort}&type=${postType}&page=${page}&limit=${limit}`);
  }, [region, sort, postType, page]);

  const allNotices = fetcher.data?.data || [];
  const totalItems = fetcher.data?.total || 0;
  const totalPages = Math.ceil(totalItems / limit);
  const isLoading = fetcher.state === 'loading';

  const filteredNotices = allNotices.filter((n: any) => n.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const servers = [
    { id: 'ALL', label: t('servers.ALL') },
    { id: 'KR', label: t('servers.KR') },
    { id: 'Global', label: t('servers.Global') },
    { id: 'JP', label: t('servers.JP') },
    { id: 'TW', label: t('servers.TW') },
  ];

  const types = [
    { id: 'ALL', label: t('types.ALL') },
    { id: 'VIDEO', label: t('types.VIDEO') },
    { id: 'ETC', label: t('types.ETC') },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-0.5">Archive</p>
          <h1 className="text-xl font-black text-gray-900 dark:text-zinc-100 leading-none">{t('title')} (Beta)</h1>
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 border-b border-gray-300 dark:border-zinc-600 pb-1">
          <RiSearchLine className="text-gray-400 dark:text-zinc-500 shrink-0" size={14} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-40 text-sm bg-transparent text-gray-700 dark:text-zinc-300 placeholder:text-gray-300 dark:placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-2 mb-1 sm:flex-row sm:gap-0 sm:items-center sm:justify-between">
        {/* Server Tab */}
        <div className="flex gap-0">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setRegion(s.id)}
              className={`px-3 py-1.5 text-xs font-bold border-b-2 transition-all ${
                region === s.id
                  ? 'border-gray-900 dark:border-zinc-100 text-gray-900 dark:text-zinc-100'
                  : 'border-transparent text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Type + Sort */}
        <div className="flex items-center gap-3 pb-1 sm:pb-0">
          <div className="flex gap-0.5">
            {types.map((type) => (
              <button
                key={type.id}
                onClick={() => setPostType(type.id)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all ${
                  postType === type.id ? 'bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 bg-transparent outline-none cursor-pointer hover:text-gray-600 dark:hover:text-zinc-300"
          >
            <option value="new">{t('sort.new')}</option>
            <option value="modified">{t('sort.modified')}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className={`transition-opacity ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
        {filteredNotices.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-zinc-900 border-b border-gray-100 dark:border-zinc-900">
            {filteredNotices.map((post: any) => (
              <Link key={post.post_id} to={`/notices/${post.post_id}`} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-900/30 -mx-2 px-2 transition-colors group">
                {/* Thumbnail */}
                <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-900">
                  {post.thumbnail ? (
                    <img src={post.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <RiFileLine size={18} className="text-gray-300 dark:text-zinc-700" />
                    </div>
                  )}
                  {post.type === 'VIDEO' && (
                    <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 py-0.5">
                      <RiVideoLine size={10} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[10px] font-black uppercase shrink-0 ${REGION_COLORS[post.region] ?? 'text-gray-400'}`}>{post.region}</span>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-zinc-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{post.title}</h3>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-zinc-600 mt-0.5 truncate">{post.category}</p>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-gray-500 dark:text-zinc-400 tabular-nums">
                    {sort === 'new' ? getRelativeTime(post.api_create_date, locale) : getRelativeTime(post.api_modify_date, locale)}
                  </p>
                  <p className="text-[10px] text-gray-300 dark:text-zinc-700">{sort === 'new' ? t('postedAt') : t('modifiedAt')}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-gray-400 dark:text-zinc-600">{isLoading ? t('loading') : t('noResults')}</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-zinc-400 disabled:opacity-25 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
          >
            <RiArrowLeftSLine size={16} />
            {t('prev')}
          </button>
          <span className="text-xs font-bold text-gray-400 dark:text-zinc-600 tabular-nums px-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 text-xs font-bold text-gray-500 dark:text-zinc-400 disabled:opacity-25 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
          >
            {t('next')}
            <RiArrowRightSLine size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
