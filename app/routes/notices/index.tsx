import { useState, useEffect } from 'react';
import { useFetcher, Link, type LoaderFunctionArgs } from 'react-router';
import { useTranslation } from 'react-i18next';
import { RiSearchLine, RiArrowLeftSLine, RiArrowRightSLine, RiVideoLine, RiFileLine } from 'react-icons/ri';
import { getRelativeTime } from '~/utils/time';
import type { Locale } from '~/utils/i18n/config';
import { createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import type { Route } from './+types';
import { getInstance } from '~/middleware/i18next';

interface Notice {
  post_id: string;
  title: string;
  category: string;
  region: string;
  type: string;
  thumbnail?: string;
  api_create_date: number;
  api_modify_date: number;
}

interface NoticesResponse {
  data: Notice[];
  total: number;
}

const REGION_COLORS: Record<string, string> = {
  KR: 'text-rose-600 dark:text-rose-400',
  JP: 'text-violet-600 dark:text-violet-400',
  Global: 'text-blue-600 dark:text-blue-400',
  TW: 'text-amber-600 dark:text-amber-400',
};

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);

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
    void fetcher.load(`/api/notices?region=${region}&sort=${sort}&type=${postType}&page=${page}&limit=${limit}&with_total=true`);
  }, [region, sort, postType, page]);

  const allNotices = (fetcher.data as NoticesResponse | undefined)?.data || [];
  const totalItems = (fetcher.data as NoticesResponse | undefined)?.total || 0;
  const totalPages = Math.ceil(totalItems / limit);
  const isLoading = fetcher.state === 'loading';

  const filteredNotices = allNotices.filter((n) => n.title.toLowerCase().includes(searchTerm.toLowerCase()));

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
    <div className="px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <PageHeader eyebrow="Archive" title={t('title')} badge="Beta" className="mb-0" />
        <div className="flex items-center gap-1.5 border-b border-neutral-300 dark:border-neutral-600 pb-1 self-end sm:self-auto">
          <RiSearchLine className="text-neutral-400 dark:text-neutral-500 shrink-0" size={14} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-40 text-sm bg-transparent text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-300 dark:placeholder:text-neutral-600 focus:outline-none"
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
                  ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                  : 'border-transparent text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300'
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
            className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 bg-transparent outline-none cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <option value="new">{t('sort.new')}</option>
            <option value="modified">{t('sort.modified')}</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className={`transition-opacity ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
        {filteredNotices.length > 0 ? (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-900 border-b border-neutral-100 dark:border-neutral-900">
            {filteredNotices.map((post) => (
              <Link key={post.post_id} to={`/notices/${post.post_id}`} className="flex items-center gap-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900/30 -mx-2 px-2 transition-colors group">
                {/* Thumbnail */}
                <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-900">
                  {post.thumbnail ? (
                    <img src={post.thumbnail} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <RiFileLine size={18} className="text-neutral-300 dark:text-neutral-700" />
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
                    <span className={`text-[10px] font-black uppercase shrink-0 ${REGION_COLORS[post.region] ?? 'text-neutral-400'}`}>{post.region}</span>
                    <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{post.title}</h3>
                  </div>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-600 mt-0.5 truncate">{post.category}</p>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {sort === 'new' ? getRelativeTime(post.api_create_date, locale) : getRelativeTime(post.api_modify_date, locale)}
                  </p>
                  <p className="text-[10px] text-neutral-300 dark:text-neutral-700">{sort === 'new' ? t('postedAt') : t('modifiedAt')}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-neutral-400 dark:text-neutral-600">{isLoading ? t('loading') : t('noResults')}</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-1 text-xs font-bold text-neutral-500 dark:text-neutral-400 disabled:opacity-25 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            <RiArrowLeftSLine size={16} />
            {t('prev')}
          </button>
          <span className="text-xs font-bold text-neutral-400 dark:text-neutral-600 tabular-nums px-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 text-xs font-bold text-neutral-500 dark:text-neutral-400 disabled:opacity-25 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            {t('next')}
            <RiArrowRightSLine size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
