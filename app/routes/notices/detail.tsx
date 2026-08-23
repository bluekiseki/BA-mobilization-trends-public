import { useState } from 'react';
import { type LoaderFunctionArgs } from 'react-router';
import { useLoaderData, useSearchParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { env } from 'cloudflare:workers';
import { diffWords, type Change } from 'diff';
import type { Locale } from '~/utils/i18n/config';
import type { Route } from './+types/detail';
import { createMetaDescriptor } from '~/components/head';
import { getInstance } from '~/middleware/i18next';
import { SafeHtmlContent } from '~/components/common/SafeHtmlContent.client';
import { ClientOnly } from '~/components/common/ClientOnly';
import { effectiveModifyDateSql, htmlToPlainText, buildLineDiff, pairLineDiff, collapseContextLines, type DiffRow, type DiffLineRow } from '~/utils/notices.server';
import { decodeHtmlEntities } from '~/utils/decodeHtmlEntities';
import { parseImageLine } from '~/utils/notices';
import { NOTICES_CACHE_CONTROL } from '~/utils/cacheControl';

interface NoticePost {
  post_id: string;
  region: string;
  category: string;
  type: string;
  url: string | null;
  thumbnail: string | null;
  first_crawled_at: number;
  version_id: string;
  title: string;
  content: string | null;
  images: string | null;
  api_create_date: number;
  api_modify_date: number;
}

interface NoticeVersion {
  version_id: string;
  title: string;
  api_modify_date: number;
}

function getYouTubeVideoId(url: string | null): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function headers({}: Route.HeadersArgs) {
  if (process.env.NODE_ENV === 'production')
    return {
      'Cache-Control': NOTICES_CACHE_CONTROL,
    };
}

export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { postId } = params;
  const url = new URL(request.url);
  const versionId = url.searchParams.get('version'); // Extract version parameter from URL
  const listParams = url.searchParams.get('listParams'); // Query string of the /notices list this page was opened from
  const i18n = getInstance(context);
  const db = env.DB;

  if (!db) throw new Error('D1 Binding Not Found');

  // Default query
  const currentPostQuery = `
    SELECT p.post_id, p.region, p.category, p.type, p.url, p.thumbnail, p.first_crawled_at,
           pv.version_id, pv.title, pv.content, pv.images, pv.api_create_date,
           ${effectiveModifyDateSql('pv.')} AS api_modify_date
    FROM posts p
    JOIN post_versions pv ON p.post_id = pv.post_id
    WHERE p.post_id = ?
  `;

  let currentPost: NoticePost | undefined = undefined;

  // Branching logic based on presence of version parameter
  if (versionId) {
    currentPost = (await db
      .prepare(currentPostQuery + ' AND pv.version_id = ?')
      .bind(postId, versionId)
      .first()) as NoticePost | undefined;
  } else {
    currentPost = (await db
      .prepare(currentPostQuery + ' ORDER BY pv.version_id DESC LIMIT 1')
      .bind(postId)
      .first()) as NoticePost | undefined;
  }

  if (!currentPost) {
    throw new Response('Not found', { status: 404 });
  }

  // Always fetch full history.
  const { results: historyResults } = await db
    .prepare(
      `
    SELECT version_id, title, ${effectiveModifyDateSql()} AS api_modify_date
    FROM post_versions
    WHERE post_id = ?
    ORDER BY version_id DESC
  `,
    )
    .bind(postId)
    .all();

  const history = (historyResults || []) as unknown as NoticeVersion[];

  // Fetch the version right before the one being viewed, so we can offer a diff against it.
  const previousVersion = (await db
    .prepare(`SELECT version_id, title, content FROM post_versions WHERE post_id = ? AND version_id < ? ORDER BY version_id DESC LIMIT 1`)
    .bind(postId, Number(currentPost.version_id))
    .first()) as { version_id: string; title: string; content: string | null } | undefined;

  let titleDiff: Change[] | null = null;
  let contentDiff: DiffRow[] | null = null;
  if (previousVersion) {
    titleDiff = diffWords(decodeHtmlEntities(previousVersion.title), decodeHtmlEntities(currentPost.title));
    // Images live inline as their own diff line (see htmlToPlainText), so they show up
    // in place in the content diff rather than as a separate, disconnected section.
    const lineRows = pairLineDiff(buildLineDiff(htmlToPlainText(previousVersion.content ?? ''), htmlToPlainText(currentPost.content ?? '')));
    contentDiff = collapseContextLines(lineRows);
  }

  return { title: i18n.t('notices:title'), site_title: i18n.t('common:title'), currentPost, history, listParams, titleDiff, contentDiff };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const postTitle = loaderData.currentPost?.title ?? loaderData.title;
  const post = loaderData.currentPost;

  let image = '/img/1.webp';
  if (post?.thumbnail) {
    image = post.thumbnail;
  } else {
    const videoId = getYouTubeVideoId(post?.url ?? null);
    if (videoId) {
      image = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    } else if (post?.images) {
      try {
        const imgs = JSON.parse(post.images) as string[];
        if (imgs.length > 0 && imgs[0]) image = imgs[0];
      } catch {
        // ignore malformed images field
      }
    }
  }

  return createMetaDescriptor(`${postTitle} | ${loaderData.site_title}`, loaderData.title, image);
}

function DiffText({ parts }: { parts: Change[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.added ? (
          <span key={i} className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-sm">
            {part.value}
          </span>
        ) : part.removed ? (
          <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-sm line-through">
            {part.value}
          </span>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

// Renders a single line's content: an inline thumbnail for image lines, char-level
// highlighting for paired replacement lines, or plain text otherwise.
function LineText({ row }: { row: DiffLineRow }) {
  const imgSrc = parseImageLine(row.text);
  if (imgSrc) return <img src={imgSrc} alt="" className="w-12 h-12 object-cover rounded-sm align-middle" />;

  if (!row.parts) return <>{row.text}</>;
  return (
    <>
      {row.parts
        .filter((p) => (row.type === 'add' ? !p.removed : !p.added))
        .map((p, i) =>
          (row.type === 'add' ? p.added : p.removed) ? (
            <span key={i} className={row.type === 'add' ? 'bg-green-200 dark:bg-green-800/50' : 'bg-red-200 dark:bg-red-800/50'}>
              {p.value}
            </span>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
    </>
  );
}

function DiffLines({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden font-mono text-xs">
      {rows.map((row, i) =>
        row.type === 'skip' ? (
          <div key={i} className="px-3 py-1 bg-neutral-50 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 text-center">
            ⋯ {row.count} unchanged lines ⋯
          </div>
        ) : (
          <div
            key={i}
            className={`flex gap-2 px-2 py-0.5 ${
              row.type === 'add'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-300'
                : row.type === 'remove'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-300'
                  : 'text-neutral-500 dark:text-neutral-400'
            }`}
          >
            <span className="shrink-0 w-6 text-right text-neutral-300 dark:text-neutral-700 select-none">{row.oldLine ?? ''}</span>
            <span className="shrink-0 w-6 text-right text-neutral-300 dark:text-neutral-700 select-none">{row.newLine ?? ''}</span>
            <span className="shrink-0 select-none">{row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' '}</span>
            <span className="whitespace-pre-wrap wrap-break-word">
              <LineText row={row} />
            </span>
          </div>
        ),
      )}
    </div>
  );
}

export default function NoticeDetail() {
  const { currentPost, history, listParams, titleDiff, contentDiff } = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('notices');
  const { t: t_ui } = useTranslation('ui');
  const locale = i18n.language as Locale;
  const [copied, setCopied] = useState(false);
  const [diffMode, setDiffMode] = useState(false);
  const [searchParams] = useSearchParams();

  const isVideoPost = currentPost.type === 'VIDEO';
  const youtubeVideoId = getYouTubeVideoId(currentPost.url);
  const backToListHref = listParams ? `/notices?${listParams}` : '/notices';

  // Counts only the chars a paired line's char-diff actually flags as changed, not the
  // whole line's length — a 1-word edit in a long paragraph should read as 1 word, not the paragraph.
  const changedChars = (row: DiffLineRow) => {
    if (parseImageLine(row.text)) return 0;
    if (row.parts) return row.parts.filter((p) => (row.type === 'add' ? p.added : p.removed)).reduce((sum, p) => sum + p.value.length, 0);
    return row.text.length;
  };

  const diffStats = contentDiff?.reduce(
    (acc, row) => {
      if (row.type === 'add') return { ...acc, addedLines: acc.addedLines + 1, addedChars: acc.addedChars + changedChars(row) };
      if (row.type === 'remove') return { ...acc, removedLines: acc.removedLines + 1, removedChars: acc.removedChars + changedChars(row) };
      return acc;
    },
    { addedLines: 0, removedLines: 0, addedChars: 0, removedChars: 0 },
  );

  // Preserve listParams (and any other current query params) while switching between revision history entries.
  const versionHref = (versionId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('version', versionId);
    return `?${nextParams.toString()}`;
  };

  const handleCopyLink = () => {
    if (currentPost.url) {
      void navigator.clipboard.writeText(currentPost.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mx-auto px-3 md:px-4 py-8 md:py-12">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          to={backToListHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToList')}
        </Link>
      </nav>

      <article className="overflow-hidden mb-10">
        {/* Header */}
        <header className="relative py-8 md:py-10 border-b border-neutral-100 dark:border-neutral-900">
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
              {currentPost.category && (
                <span className="px-2.5 py-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 rounded-md">{currentPost.category}</span>
              )}
              {isVideoPost && <span className="px-2.5 py-1 text-[11px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-md">VIDEO</span>}
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-black text-neutral-900 dark:text-neutral-100 leading-snug mb-5">{currentPost.title}</h1>

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                { label: t('firstCrawled'), value: currentPost.first_crawled_at },
                { label: t('apiCreated'), value: currentPost.api_create_date },
                { label: t('apiModified'), value: currentPost.api_modify_date },
              ].map(({ label, value }) => (
                <div key={label} className="bg-neutral-50 dark:bg-neutral-900 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{new Date(value).toLocaleString(locale)}</p>
                </div>
              ))}
            </div>

            {/* Original Link */}
            {currentPost.url && (
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800">
                <svg className="w-3.5 h-3.5 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  className="flex-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 truncate transition-colors"
                >
                  {currentPost.url}
                </a>
                <button
                  onClick={handleCopyLink}
                  className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                    copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {copied ? t_ui('copied') : t_ui('copy')}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* YouTube Embed */}
        {youtubeVideoId && (
          <div className="aspect-video w-full border-b border-neutral-100 dark:border-neutral-900 bg-black">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${youtubeVideoId}`}
              title="YouTube video player"
              // eslint-disable-next-line @typescript-eslint/no-deprecated
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

        {/* Notice Body */}
        <div className="py-8 md:py-10">
          {contentDiff && diffStats && (
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2 text-xs font-bold tabular-nums">
                <span className="text-neutral-400 dark:text-neutral-500">{t('diffStatsLines')}</span>
                <span className="text-green-600 dark:text-green-400">+{diffStats.addedLines}</span>
                <span className="text-red-600 dark:text-red-400">-{diffStats.removedLines}</span>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="text-neutral-400 dark:text-neutral-500">{t('diffStatsChars')}</span>
                <span className="text-green-600 dark:text-green-400">+{diffStats.addedChars}</span>
                <span className="text-red-600 dark:text-red-400">-{diffStats.removedChars}</span>
              </div>
              <button
                onClick={() => setDiffMode((v) => !v)}
                className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
              >
                {diffMode ? t('viewFull') : t('viewDiff')}
              </button>
            </div>
          )}

          {diffMode && contentDiff ? (
            <div className="space-y-4">
              {titleDiff && titleDiff.some((part) => part.added || part.removed) && (
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1">{t('titleChanged')}</p>
                  <p className="text-base font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                    <DiffText parts={titleDiff} />
                  </p>
                </div>
              )}
              <DiffLines rows={contentDiff} />
            </div>
          ) : currentPost.content ? (
            youtubeVideoId ? (
              <p className="whitespace-pre-wrap text-base text-neutral-800 dark:text-neutral-200 leading-relaxed">{currentPost.content}</p>
            ) : (
              <ClientOnly>
                <SafeHtmlContent
                  html={currentPost.content}
                  className="prose dark:prose-invert max-w-none prose-img:rounded-xl prose-a:text-blue-600 [&_img]:max-w-full! [&_img]:h-auto! [&_table]:w-auto!"
                />
              </ClientOnly>
            )
          ) : (
            <p className="text-neutral-400 dark:text-neutral-600 italic text-sm">{t('noContent')}</p>
          )}
        </div>
      </article>

      <nav className="mb-6">
        <Link
          to={backToListHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('backToList')}
        </Link>
      </nav>

      {/* Revision History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-black text-neutral-900 dark:text-neutral-100 mb-5 flex items-center gap-2">
            <span className="w-1 h-5 bg-blue-600 rounded-full" />
            {t('historyTitle')}
            <span className="ml-1 text-xs font-bold text-neutral-400 dark:text-neutral-500">({history.length})</span>
          </h2>

          <div className="relative pl-6 border-l-2 border-neutral-100 dark:border-neutral-800 space-y-3">
            {history.map((version, index) => {
              // Check if it matches the version_id of the data currently displayed
              const isCurrentView = currentPost?.version_id === version.version_id;
              const isLatest = index === 0;

              return (
                <div key={version.version_id} className="relative">
                  {/* Timeline Dot */}
                  <div
                    className={`absolute -left-5.75 top-3.5 w-3 h-3 rounded-full border-2 border-white dark:border-neutral-950 shadow-sm ${
                      isCurrentView ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  />

                  {/* Changed from a simple div to Link to make it clickable */}
                  <Link
                    to={versionHref(version.version_id)}
                    className={`block rounded-xl border px-4 py-3 transition-colors hover:border-blue-300 dark:hover:border-blue-800 ${
                      isCurrentView ? 'border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20' : 'border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 leading-snug line-clamp-2">{version.title}</p>
                      <span className="shrink-0 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 tabular-nums mt-0.5">{new Date(version.api_modify_date).toLocaleString(locale)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrentView ? (
                        <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-[10px] font-black rounded">{t('currentlyViewing')}</span>
                      ) : isLatest ? (
                        <span className="inline-block px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 text-[10px] font-black rounded">{t('latestVersion')}</span>
                      ) : null}

                      {!isCurrentView && <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-600">{t('versionId', { id: version.version_id })}</span>}
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-600">{t('changeRecorded')}</span>
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
