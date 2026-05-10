import { useState } from 'react';
import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { env } from 'cloudflare:workers';
import type { Locale } from '~/utils/i18n/config';
import type { Route } from './+types/detail';
import { createMetaDescriptor } from '~/components/head';
import { getInstance } from '~/middleware/i18next';

function getYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { postId } = params;
  const url = new URL(request.url);
  const versionId = url.searchParams.get('version'); // Extract version parameter from URL
  let i18n = getInstance(context);
  const db = env.DB;

  if (!db) throw new Error('D1 Binding Not Found');

  // Default query
  let currentPostQuery = `
    SELECT p.post_id, p.region, p.category, p.type, p.url, p.thumbnail, p.first_crawled_at,
           pv.version_id, pv.title, pv.content, pv.images, pv.api_create_date, pv.api_modify_date, pv.crawled_at
    FROM posts p
    JOIN post_versions pv ON p.post_id = pv.post_id
    WHERE p.post_id = ?
  `;

  let currentPost;

  // Branching logic based on presence of version parameter
  if (versionId) {
    currentPost = (await db
      .prepare(currentPostQuery + ' AND pv.version_id = ?')
      .bind(postId, versionId)
      .first()) as any;
  } else {
    currentPost = (await db
      .prepare(currentPostQuery + ' ORDER BY pv.version_id DESC LIMIT 1')
      .bind(postId)
      .first()) as any;
  }

  if (!currentPost) {
    throw new Response('Not found', { status: 404 });
  }

  // Always fetch full history.
  const { results: history } = await db
    .prepare(
      `
    SELECT version_id, title, api_modify_date, crawled_at
    FROM post_versions
    WHERE post_id = ?
    ORDER BY version_id DESC
  `,
    )
    .bind(postId)
    .all();

  return { title: i18n.t('notices:title'), site_title: i18n.t('common:title'), currentPost, history };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return createMetaDescriptor((loaderData?.currentPost?.title || loaderData.title) + ' | ' + loaderData.site_title, loaderData.title, '/img/1.webp');
}

export default function NoticeDetail() {
  const { currentPost, history } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('notices');
  const locale = i18n.language as Locale;
  const [copied, setCopied] = useState(false);

  const isVideoPost = currentPost.type === 'VIDEO';
  const youtubeVideoId = getYouTubeVideoId(currentPost.url);

  const handleCopyLink = () => {
    if (currentPost.url) {
      navigator.clipboard.writeText(currentPost.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mx-auto px-4 py-8 md:py-12">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link to="/notices" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToList')}
        </Link>
      </nav>

      <article className="overflow-hidden shadow-sm mb-10">
        {/* Header */}
        <header className="relative p-6 md:p-8 border-b border-gray-100 dark:border-zinc-900">
          {/* Thumbnail background blur (if exists) */}
          {currentPost.thumbnail && (
            <div
              className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] bg-center bg-cover blur-2xl scale-110 pointer-events-none"
              style={{ backgroundImage: `url(${currentPost.thumbnail})` }}
            />
          )}

          <div className="relative">
            {/* Badge */}
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2.5 py-1 text-[11px] font-black uppercase tracking-widest bg-blue-600 text-white rounded-md">{currentPost.region}</span>
              {currentPost.category && <span className="px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-900 rounded-md">{currentPost.category}</span>}
              {isVideoPost && <span className="px-2.5 py-1 text-[11px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md">VIDEO</span>}
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-zinc-100 leading-snug mb-5">{currentPost.title}</h1>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: t('firstCrawled'), value: currentPost.first_crawled_at },
                { label: t('apiCreated'), value: currentPost.api_create_date },
                { label: t('apiModified'), value: currentPost.api_modify_date },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 dark:bg-zinc-900 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300">{new Date(value).toLocaleString(locale)}</p>
                </div>
              ))}
            </div>

            {/* Original Link */}
            {currentPost.url && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <a
                  href={currentPost.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-[11px] font-medium text-gray-500 dark:text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 truncate transition-colors"
                >
                  {currentPost.url}
                </a>
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                    copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-gray-200 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* YouTube Embed */}
        {youtubeVideoId && (
          <div className="aspect-video w-full border-b border-gray-100 dark:border-zinc-900 bg-black">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${youtubeVideoId}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

        {/* Notice Body */}
        <div className="p-6 md:p-10">
          {currentPost.content ? (
            youtubeVideoId ? (
              <p className="whitespace-pre-wrap text-base text-gray-800 dark:text-zinc-200 leading-relaxed">{currentPost.content}</p>
            ) : (
              <div className="prose dark:prose-invert max-w-none prose-img:rounded-xl prose-a:text-blue-600" dangerouslySetInnerHTML={{ __html: currentPost.content }} />
            )
          ) : (
            <p className="text-gray-400 dark:text-zinc-600 italic text-sm">{t('noContent')}</p>
          )}
        </div>
      </article>

      <nav className="mb-6">
        <Link to="/notices" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToList')}
        </Link>
      </nav>

      {/* Revision History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-black text-gray-900 dark:text-zinc-100 mb-5 flex items-center gap-2">
            <span className="w-1 h-5 bg-blue-600 rounded-full" />
            {t('historyTitle')}
            <span className="ml-1 text-xs font-bold text-gray-400 dark:text-zinc-500">({history.length})</span>
          </h2>

          <div className="relative pl-6 border-l-2 border-gray-100 dark:border-zinc-800 space-y-3">
            {history.map((version: any, index: number) => {
              // Check if it matches the version_id of the data currently displayed
              const isCurrentView = currentPost.version_id === version.version_id;
              const isLatest = index === 0;

              return (
                <div key={version.version_id} className="relative">
                  {/* Timeline Dot */}
                  <div
                    className={`absolute -left-5.75 top-3.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-950 shadow-sm ${
                      isCurrentView ? 'bg-blue-500' : 'bg-gray-300 dark:bg-zinc-700'
                    }`}
                  />

                  {/* Changed from a simple div to Link to make it clickable */}
                  <Link
                    to={`?version=${version.version_id}`}
                    className={`block rounded-xl border px-4 py-3 transition-colors hover:border-blue-300 dark:hover:border-blue-800 ${
                      isCurrentView ? 'border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20' : 'border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 leading-snug line-clamp-2">{version.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-gray-400 dark:text-zinc-500 tabular-nums mt-0.5">{new Date(version.api_modify_date).toLocaleString(locale)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrentView ? (
                        <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded">{t('currentlyViewing')}</span>
                      ) : isLatest ? (
                        <span className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 text-[10px] font-black rounded">{t('latestVersion')}</span>
                      ) : null}

                      {!isCurrentView && <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-600">{t('versionId', { id: version.version_id })}</span>}
                      <span className="text-[10px] text-gray-400 dark:text-zinc-600">{t('changeRecorded')}</span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
