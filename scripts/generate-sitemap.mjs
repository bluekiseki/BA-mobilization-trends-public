import { writeFile } from 'node:fs/promises';
import eventList from '../app/data/jp/eventList.json' with { type: 'json' };
import siteConfig from '../app/data/livedataServer.json' with { type: 'json' };
import jpRaidList from '../app/data/jp/full.raidinfo.json' with { type: 'json' };
import krRaidList from '../app/data/kr/full.raidinfo.json' with { type: 'json' };
import changelog from '../app/data/changelog.json' with { type: 'json' };

const locales = ['', '/ko', '/ja', '/zh-Hant'];
const hreflangs = ['en', 'ko', 'ja', 'zh-Hant'];
const baseUrl = siteConfig.productionUrl;

const toDate = (value) => (typeof value === 'string' ? value.slice(0, 10) : undefined);
const newerOf = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

// Changelog entries are newest-first and each lists the (locale-agnostic) paths it touched,
// so the first date we see for a path is its most recent real content update.
const changelogLastmod = new Map();
for (const entry of changelog) {
  for (const path of entry.to ?? []) {
    if (!changelogLastmod.has(path)) changelogLastmod.set(path, entry.date);
  }
}

const eventIds = [
  ...new Set(
    Object.entries(eventList)
      .filter(([, event]) => event.Planable !== false)
      .map(([id]) => Number(id) % 100000),
  ),
].sort((a, b) => a - b);

// Multiple raw ids can map to the same short id (reruns) — keep the latest CloseTime among them.
const eventCloseDate = new Map();
for (const [id, event] of Object.entries(eventList)) {
  const shortId = Number(id) % 100000;
  eventCloseDate.set(shortId, newerOf(eventCloseDate.get(shortId), toDate(event.CloseTime)));
}

const raidPaths = [...new Set([...jpRaidList.map((raid) => `/dashboard/jp/${raid.Id}`), ...krRaidList.map((raid) => `/dashboard/kr/${raid.Id}`)])].sort();
const raidLastmod = new Map();
for (const raid of jpRaidList) raidLastmod.set(`/dashboard/jp/${raid.Id}`, toDate(raid.Date));
for (const raid of krRaidList) raidLastmod.set(`/dashboard/kr/${raid.Id}`, toDate(raid.Date));

// Static/basic pages that are open to crawling per public/robots.txt.
// Keep this list in sync with robots.txt's Allow rules — a sitemap entry blocked by
// robots.txt is a well-known Search Console warning.
const staticPages = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/planner/event', changefreq: 'daily', priority: '0.9' },
  { path: '/calendar', changefreq: 'daily', priority: '0.9' },
  { path: '/planner/gacha', changefreq: 'weekly', priority: '0.8' },
  { path: '/charts/jp/ranking', changefreq: 'daily', priority: '0.8' },
  { path: '/charts/kr/ranking', changefreq: 'daily', priority: '0.8' },
  { path: '/scanner/item', changefreq: 'monthly', priority: '0.7' },
  { path: '/scanner/student', changefreq: 'monthly', priority: '0.7' },
  { path: '/dashboard/jp', changefreq: 'weekly', priority: '0.7' },
  { path: '/dashboard/kr', changefreq: 'weekly', priority: '0.7' },
  { path: '/dashboard/jp/videos', changefreq: 'weekly', priority: '0.6' },
  { path: '/dashboard/kr/videos', changefreq: 'weekly', priority: '0.6' },
  { path: '/notices', changefreq: 'daily', priority: '0.6' },
  { path: '/charts/jp/heatmap', changefreq: 'weekly', priority: '0.6' },
  { path: '/charts/kr/heatmap', changefreq: 'weekly', priority: '0.6' },
  { path: '/charts/jp/network', changefreq: 'weekly', priority: '0.6' },
  { path: '/charts/kr/network', changefreq: 'weekly', priority: '0.6' },
  { path: '/charts/favor', changefreq: 'weekly', priority: '0.6' },
  { path: '/utils/jukebox', changefreq: 'monthly', priority: '0.5' },
  { path: '/utils/favor', changefreq: 'monthly', priority: '0.5' },
  { path: '/planner/students', changefreq: 'monthly', priority: '0.5' },
  { path: '/planner/equipment', changefreq: 'monthly', priority: '0.5' },
  { path: '/planner/resources', changefreq: 'monthly', priority: '0.5' },
];

const eventPages = eventIds.map((id) => ({
  path: `/planner/event/${id}`,
  changefreq: 'weekly',
  priority: '0.6',
  lastmod: eventCloseDate.get(id),
}));

const raidPages = raidPaths.map((path) => ({
  path,
  changefreq: 'monthly',
  priority: '0.4',
  lastmod: raidLastmod.get(path),
}));

const pages = [...staticPages, ...eventPages, ...raidPages];

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

const entries = pages.flatMap((page) =>
  locales.map((localePrefix) => {
    const lastmod = newerOf(page.lastmod, changelogLastmod.get(page.path));
    const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';

    const alternates = hreflangs
      .map((hreflang, index) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(`${baseUrl}${locales[index]}${page.path}`)}" />`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${baseUrl}${page.path}`)}" />`)
      .join('\n');

    return `  <url>\n    <loc>${escapeXml(`${baseUrl}${localePrefix}${page.path}`)}</loc>${lastmodTag}\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n${alternates}\n  </url>`;
  }),
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;

await writeFile(new URL('../public/sitemap.xml', import.meta.url), sitemap, 'utf8');
console.log(`Generated sitemap.xml with ${entries.length} localized URLs (${pages.length} pages x ${locales.length} locales).`);
