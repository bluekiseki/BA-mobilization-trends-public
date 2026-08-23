import { useState } from 'react';
import { useLoaderData, useSearchParams, useNavigation, type LoaderFunctionArgs } from 'react-router';
import { env } from 'cloudflare:workers';
import { useTranslation } from 'react-i18next';
import { RiSearchLine, RiArrowLeftSLine, RiArrowRightSLine } from 'react-icons/ri';
import type { Locale } from '~/utils/i18n/config';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/head';
import { PageHeader } from '~/components/common/PageHeader';
import type { Route } from './+types';
import { getInstance } from '~/middleware/i18next';
import { queryNotices } from '~/utils/notices-query.server';
import { NoticeListItem } from '~/components/NoticeListItem';
import type { AppHandle } from '~/types/link';
import { NOTICES_CACHE_CONTROL } from '~/utils/cacheControl';

const LIMIT = 20;

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': NOTICES_CACHE_CONTROL,
    };
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = i18n.language as Locale;

  const url = new URL(request.url);
  const region = url.searchParams.get('region') || 'ALL';
  const sort = url.searchParams.get('sort') || 'new';
  const type = url.searchParams.get('type') || 'ALL';
  const page = Number(url.searchParams.get('page')) || 1;

  const db = env.DB;
  if (!db) throw new Error('D1 Binding Not Found');

  const { data, total } = await queryNotices(db, { region, sort, type, page, limit: LIMIT, withTotal: true });

  return {
    title: i18n.t('notices:title'),
    site_title: i18n.t('common:title'),
    locale,
    canonicalUrl: createLocalizedUrl(locale, '/notices'),
    notices: data,
    total: total ?? 0,
    page,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor(loaderData.title + ' | ' + loaderData.site_title, loaderData.title, '/img/1.webp', loaderData.canonicalUrl);
}

// Filter/sort/page query params are for in-page state only — search engines should always index the bare /notices URL.
export const handle: AppHandle = {
  preload: (data: unknown) => {
    const d = data as Record<string, unknown> | undefined;
    const locale = d?.locale as Locale;
    return [{ rel: 'canonical', href: createLocalizedUrl(locale, '/notices') }, ...createLinkHreflang('/notices')];
  },
};

export default function NoticesIndex() {
  const { notices, total, page } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('notices');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const navigation = useNavigation();

  const [searchParams, setSearchParams] = useSearchParams();
  const region = searchParams.get('region') || 'ALL';
  const sort = searchParams.get('sort') || 'new';
  const postType = searchParams.get('type') || 'ALL';
  const [searchTerm, setSearchTerm] = useState('');

  // Update the filter params, resetting back to page 1 whenever a filter (not the page) changes.
  const setFilter = (updates: Record<string, string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === 'ALL' || value === 'new') next.delete(key);
        else next.set(key, value);
      }
      next.delete('page');
      return next;
    });
  };

  const setPage = (updater: (current: number) => number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const nextPage = updater(page);
      if (nextPage <= 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
  };

  const totalPages = Math.ceil(total / LIMIT);
  const isLoading = navigation.state === 'loading';

  const filteredNotices = notices.filter((n) => n.title.toLowerCase().includes(searchTerm.toLowerCase()));

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
              onClick={() => setFilter({ region: s.id })}
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
                onClick={() => setFilter({ type: type.id })}
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
            onChange={(e) => setFilter({ sort: e.target.value })}
            className="text-[11px] ios-compact-11 font-bold text-neutral-400 dark:text-neutral-500 bg-transparent outline-none cursor-pointer hover:text-neutral-600 dark:hover:text-neutral-300"
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
            {filteredNotices.map((post) => {
              const listQuery = searchParams.toString();
              const to = listQuery ? `/notices/${post.post_id}?listParams=${encodeURIComponent(listQuery)}` : `/notices/${post.post_id}`;
              return <NoticeListItem key={post.post_id} post={post} to={to} sort={sort} locale={locale} />;
            })}
          </div>
        ) : (
          <div className="py-24 text-center text-sm text-neutral-400 dark:text-neutral-600">{isLoading ? t_ui('loading') : t('noResults')}</div>
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
