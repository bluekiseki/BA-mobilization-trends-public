// Generates the public plain-text feeds (public/llms.txt, public/txt/**) documented at /developers.
// The formatters live in app/utils/textFeeds.ts; they are loaded through Vite's runnerImport so the
// feeds reuse the exact app code (schedule CSV parsing, gift preference, i18n) instead of a copy.
//
// Inputs under public/ (ew/, schaledb.com/, w/) are symlinks to data outside this repo, so they are
// missing in CI builds. Missing files are fetched from the CDN that already serves them to the site.
// This script must never fail the build: on any error it logs and exits 0 without feeds.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import i18next from 'i18next';
import xz from 'xz-decompress';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(publicDir, 'txt');

const load = async (file) => (await runnerImport(path.join(root, file), { configFile: false, root, resolve: { alias: { '~': path.join(root, 'app') } }, logLevel: 'error' })).module;
const readRepoJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));

async function main() {
  const [feeds, meta, schedule, raidInfo, siteConfig] = await Promise.all([
    load('app/utils/textFeeds.ts'),
    load('app/data/textFeeds.meta.ts'),
    load('app/utils/calender.data.v2.ts'),
    load('app/utils/loadRaidInfo.ts'),
    readRepoJson('app/data/livedataServer.json'),
  ]);

  // public/<rel> from disk, else from the CDN (same path under /assets/). null when neither has it.
  const cdnBase = `https://${siteConfig.cdn}/assets/`;
  const sources = { local: 0, cdn: 0, missing: 0 };
  async function readPublic(rel) {
    try {
      const data = await readFile(path.join(publicDir, rel));
      sources.local++;
      return data;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    // Transient network errors are retried; a file that still cannot be fetched counts as missing,
    // which only drops the feeds that need it.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(cdnBase + rel);
        if (res.status === 404) break;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        sources.cdn++;
        return data;
      } catch (error) {
        if (attempt === 3) console.warn(`[text-feeds] could not fetch ${rel}: ${error.cause?.code ?? error.message}`);
        else await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    sources.missing++;
    return null;
  }
  const readPublicJson = async (rel) => {
    const data = await readPublic(rel);
    return data ? JSON.parse(data.toString('utf8')) : null;
  };
  const { processStream } = await load('app/utils/xorProcess.ts');
  const decodeBin = async (rel) => {
    const data = await readPublic(rel);
    return data ? new Response(new xz.XzReadableStream(processStream(new Response(data).body))).json() : null;
  };

  const ctx = { baseUrl: siteConfig.productionUrl };
  const shortName = (lang) => (lang === 'zh-Hant' ? 'zh_Hant' : lang);

  const eventList = await readRepoJson('app/data/jp/eventList.json');
  const [globalIcons, favorStories] = await Promise.all([readPublicJson('ew/icon_info.json'), readPublicJson('schaledb.com/student_favor_stories_parsed.json')]);

  const scheduleTracks = {
    jp: schedule.loadScheduleDataV2({ server: 'jp', tracksToLoad: 'all' }).tracks,
    kr: schedule.loadScheduleDataV2({ server: 'kr', tracksToLoad: 'all' }).tracks,
  };
  const krDates = new Map(
    (scheduleTracks.kr.event ?? []).filter((e) => e.eventId != null).map((e) => [Number(e.eventId), { start: e.startTime, end: e.endTime, prediction: !!e.details?.prediction }]),
  );

  // Planner events: every id the schedules or eventList mention that has an event.<id>.json
  // (its `season` block is the same data as the planner's event.season.<id>.json).
  const candidateIds = [...new Set([...Object.keys(eventList).map(Number), ...['jp', 'kr'].flatMap((s) => (scheduleTracks[s].event ?? []).map((e) => Number(e.eventId)))])].filter(
    (id) => id > 0 && feeds.isPublicPlannerEvent(eventList, id),
  );
  const events = [];
  for (let i = 0; i < candidateIds.length; i += 4) {
    const batch = await Promise.all(candidateIds.slice(i, i + 4).map(async (id) => ({ id, data: await readPublicJson(`ew/event.${id}.json`) })));
    for (const { id, data } of batch) if (data?.season) events.push({ id, season: data.season, data });
  }

  // Student raid usage (JP only): the same XOR + xz encoded files the ranking chart reads.
  const RAID_USAGE_SEASONS = 10;
  const playRate = await decodeBin('w/jp/play_rate_rank.bin').catch((error) => {
    console.warn(`[text-feeds] raid usage skipped: ${error.message}`);
    return null;
  });

  let written = 0;
  const write = async (rel, content) => {
    const file = path.join(outDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    written++;
  };

  await rm(outDir, { recursive: true, force: true });

  for (const server of ['jp', 'kr']) {
    await write(`raids/${feeds.feedServerName(server)}.txt`, feeds.formatRaids(raidInfo.loadRaidFullInfos(server), server, ctx));
  }

  for (const lang of meta.TEXT_FEED_LANGS) {
    const short = shortName(lang);
    const resources = (await load(`app/locales/${short}/index.ts`)).default;
    const i18n = i18next.createInstance();
    await i18n.init({ lng: lang, fallbackLng: 'en', resources: { [lang]: resources }, ns: Object.keys(resources), interpolation: { escapeValue: false } });

    const students = await readPublicJson(`schaledb.com/${short}.students.min.json`);

    if (students && globalIcons && favorStories) {
      // Raid index and sample size come from the raid_info shipped with play_rate_rank (team-data
      // sample), not app/data's raid_info.json (overall participant counts).
      const raids = playRate ? await decodeBin(`w/jp/${short}.raid_info.bin`).catch(() => null) : null;
      const usage = playRate && raids ? feeds.buildRaidUsage(playRate, raids, 'jp', RAID_USAGE_SEASONS) : new Map();

      await write(`${lang}/students.txt`, feeds.formatStudentList(students, lang, ctx));
      for (const student of Object.values(students)) {
        await write(
          `${lang}/students/${student.Id}.txt`,
          feeds.formatStudentDetail(student, { icons: globalIcons, favorStories, students, raidUsage: usage.get(Number(student.Id)) ?? [] }, lang, i18n.t.bind(i18n), ctx),
        );
      }
    } else {
      console.warn(`[text-feeds] student feeds skipped for ${lang}: missing students/icon/favor-story data`);
    }

    if (globalIcons) {
      await write(`${lang}/events.txt`, feeds.formatEventList(events, eventList, krDates, lang, ctx));
      for (const { id, season, data } of events) {
        await write(`${lang}/events/${id}.txt`, feeds.formatEventDetail(id, season, data, { eventList, globalIcons, students: students ?? {}, krDates: krDates.get(id) }, lang, ctx));
      }
    } else {
      console.warn(`[text-feeds] event feeds skipped for ${lang}: missing icon data`);
    }

    for (const server of ['jp', 'kr']) {
      await write(`${lang}/schedule/${feeds.feedServerName(server)}.txt`, feeds.formatSchedule(scheduleTracks[server], server, students ?? {}, lang, i18n, ctx));
    }
  }

  await writeFile(path.join(publicDir, 'llms.txt'), feeds.buildLlmsTxt(ctx));
  console.log(`[text-feeds] wrote llms.txt + ${written} files under public/txt (inputs: ${sources.local} local, ${sources.cdn} from CDN, ${sources.missing} missing)`);
}

try {
  await main();
} catch (error) {
  // Feeds are optional; a broken input must never block a deploy.
  console.error('[text-feeds] generation failed, deploying without text feeds:', error);
  await rm(outDir, { recursive: true, force: true }).catch(() => {});
}
