import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/developers';
import { TEXT_FEED_FORMAT_VERSION, TEXT_FEED_LANGS, TEXT_FEED_RATE_LIMIT, TEXT_FEEDS, type TextFeedMeta } from '~/data/textFeeds.meta';
import { productionUrl } from '~/data/livedataServer.json';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({ title: i18n.t('common:title') });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = 'Developers - ' + loaderData.title;
  const description = 'Plain-text feeds of Blue Archive students, events, schedules, raid seasons and notices for developers and their tools.';
  return [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { tagName: 'link', rel: 'canonical', href: `${productionUrl}/developers` }];
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="font-mono text-sm px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 break-words">{children}</code>
);

const FeedSection = ({ feed }: { feed: TextFeedMeta }) => (
  <section id={feed.id} className="py-6 border-t border-neutral-200 dark:border-neutral-700 scroll-mt-16">
    <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{feed.title}</h3>
    <p className="mt-1">
      <Code>GET {feed.path}</Code>
    </p>
    <p className="mt-2 text-neutral-600 dark:text-neutral-400 leading-relaxed">{feed.desc}</p>
    <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
      Example:{' '}
      <a href={feed.example} className="text-blue-600 dark:text-blue-400 hover:underline break-all">
        {feed.example}
      </a>{' '}
      · Updated {feed.update}
      {feed.source && <> · Source: {feed.source}</>}
    </p>

    {feed.columns && (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-600 text-neutral-500 dark:text-neutral-400">
              <th className="py-1.5 pr-4 font-medium">Column</th>
              <th className="py-1.5 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {feed.columns.map((c) => (
              <tr key={c.name} className="border-b border-neutral-200 dark:border-neutral-700 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap align-top">{c.name}</td>
                <td className="py-1.5 text-neutral-600 dark:text-neutral-400">{c.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    {feed.sections && <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Sections: {feed.sections.map((s, i) => [i > 0 && ', ', <Code key={s}>## {s}</Code>])}</p>}
  </section>
);

export default function DevelopersPage() {
  return (
    <div className="font-pretendard px-4 py-6">
      <h1 className="text-3xl md:text-4xl font-bold text-neutral-800 dark:text-white mb-4 border-b border-neutral-300 dark:border-neutral-600 pb-4">Developers</h1>
      <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
        Plain-text feeds of students, events, schedules, raid seasons and notices, for other programs to read without scraping HTML. When working with a coding agent, point it at{' '}
        <a href="/llms.txt" className="text-blue-600 dark:text-blue-400 hover:underline">
          /llms.txt
        </a>
        , which lists every feed below.
      </p>

      <h2 className="text-2xl font-bold text-neutral-800 dark:text-white mt-10 mb-3">Conventions</h2>
      <ul className="list-disc list-inside space-y-1.5 text-neutral-600 dark:text-neutral-400 pl-2">
        <li>
          Format version <Code>{TEXT_FEED_FORMAT_VERSION}</Code>. Columns are only appended; a breaking change bumps the version (shown in each feed's <Code># format:</Code> line).
        </li>
        <li>
          Lines starting with <Code>#</Code> are comments. In TSV feeds the first other line is the column header; split rows by tab.
        </li>
        <li>
          Detail feeds use <Code>## Section</Code> headings followed by <Code>key: value</Code> lines. Indented lines belong to the entry above (e.g. a skill's <Code>Desc</Code>, a story's{' '}
          <Code>Summary</Code>). Multiple values in one line, such as rewards, are separated by <Code>; </Code>.
        </li>
        <li>Times are ISO 8601 in UTC. Static feeds are regenerated on every deploy.</li>
        <li>
          <Code>{'{lang}'}</Code> = {TEXT_FEED_LANGS.join(' | ')}, <Code>{'{server}'}</Code> = jp | gl (Global).
        </li>
        <li>
          <Code>/txt/**</Code> are static files. The notices feed is limited to {TEXT_FEED_RATE_LIMIT.notices} requests per {TEXT_FEED_RATE_LIMIT.periodSeconds} seconds per IP; exceeding it returns{' '}
          <Code>429</Code> with <Code>Retry-After</Code>. Cache responses on your side.
        </li>
        <li>
          CORS is open (<Code>Access-Control-Allow-Origin: *</Code>, GET only).
        </li>
        <li>
          Data sources and licenses are listed on{' '}
          <a href="/source" className="text-blue-600 dark:text-blue-400 hover:underline">
            Data Sources
          </a>
          . Blue Archive data and assets belong to NEXON Games and Yostar.
        </li>
      </ul>

      <pre className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 overflow-x-auto">
        <code>{`curl '${productionUrl}/txt/en/students.txt'\ncurl '${productionUrl}/txt/en/students/10001.txt'\ncurl '${productionUrl}/txt/en/schedule/gl.txt'`}</code>
      </pre>

      <h2 className="text-2xl font-bold text-neutral-800 dark:text-white mt-10 mb-1">Feeds</h2>
      {TEXT_FEEDS.map((feed) => (
        <FeedSection key={feed.id} feed={feed} />
      ))}
    </div>
  );
}
