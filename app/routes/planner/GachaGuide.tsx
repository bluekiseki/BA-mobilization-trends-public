// app/routes/planner/GachaGuide.tsx
// Static, self-contained newbie strategy guide for the gacha planner — no game/schedule data fetch,
// just localized prose. Loader/meta/handle mirror Gacha_v2.tsx's canonical + hreflang setup exactly.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaArrowLeft } from 'react-icons/fa';
import { loadPortraitMap } from '~/utils/studentPortraitMap';
import { cdn } from '~/utils/cdn';
import { PickupStudentIcon } from '~/components/student/PickupStudentIcon';
import type { Student } from '~/types/data';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import { createLinkHreflang, createLocalizedUrl, createMetaDescriptor } from '~/components/shell/head';
import { PageHeader } from '~/components/common/PageHeader';
import { DEFAULT_LOCALE, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import type { AppHandle } from '~/types/link';
import type { Route } from './+types/GachaGuide';

export const handle: AppHandle = {
  preload: () => createLinkHreflang('/planner/gacha/guide'),
};

// Fixed dates for the "Published / Last updated" stamp at the top of the page. Update
// GUIDE_LAST_UPDATED by hand whenever the prose changes — not derived from git history.
const GUIDE_PUBLISHED = '2026-09-09';
const GUIDE_LAST_UPDATED = '2026-09-16';

export function loader({ context, params }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  const locale = (params.locale as Locale) || (i18n.language as Locale) || DEFAULT_LOCALE;

  return data({
    siteTitle: i18n.t('common:title'),
    title: i18n.t('gachaGuide:title'),
    description: i18n.t('gachaGuide:meta_description'),
    canonicalUrl: createLocalizedUrl(locale, '/planner/gacha/guide'),
  });
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    ...createMetaDescriptor(loaderData.title + ' | ' + loaderData.siteTitle, loaderData.description, '/img/gacha.webp', loaderData.canonicalUrl),
    { tagName: 'link', rel: 'canonical', href: loaderData.canonicalUrl },
  ];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-200 dark:border-neutral-800 pt-6 mt-6 first:border-t-0 first:pt-0 first:mt-0">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">{title}</h2>
      <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function GachaGuide() {
  const loaderData = useLoaderData<typeof loader>();
  const { t, i18n } = useTranslation('gachaGuide');
  // ko-only glossary keys (e.g. 'foresight') aren't in the en resource that types t() against, so
  // this dynamic-key lookup needs a loosely-typed variant — same pattern as IncomeSettingsPanel_v2.tsx.
  const tDynamic = t as (key: string) => string;
  const locale = i18n.language as Locale;

  // 'foresight' (knowing upcoming content by watching an earlier server) is
  // Korean-community slang with no established equivalent term in the other language communities,
  // so it's ko-only here rather than presented as a shared term across locales.
  const baseGlossaryKeys = ['ceiling', 'half_ceiling', 'charge', 'pull10', 'pickup', 'fes', 'limited', 'archive', 'rerun'] as const;
  const glossaryKeys = locale === 'ko' ? ([...baseGlossaryKeys, 'foresight'] as const) : baseGlossaryKeys;
  const oddsRows = ['row1', 'row2', 'row3'] as const;

  // Portraits for the two students named in this guide (Kisaki, Hanako (Swimsuit)) — fetched lazily via
  // the same shared/cached loader the nav avatar picker uses, so it's a no-op if already warm.
  const [portraitMap, setPortraitMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void loadPortraitMap()
      .then((m) => alive && setPortraitMap(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const KISAKI_ID = 20039;
  const HANAKO_SWIMSUIT_ID = 10074;
  // "Key support" examples for the priority list — several names, not one pick.
  const KEY_SUPPORT_IDS = [10123, 10089, 10085, 10105]; // Seia (Swimsuit), Aru (Dress), Hare (Camping)

  // Name/fest/limited/bulletType for every icon this page renders come from this same per-locale
  // student list — not hardcoded, so they stay correct in every language without a name lookup table
  // of our own. The same fetch also derives the full current Fes-support and Fes-striker rosters
  // (TacticRole 'Supporter' / 'DamageDealer' among Fes-flagged students, newest first) — two
  // independent lists, each its own state, not one shared "role" object.
  const [studentInfo, setStudentInfo] = useState<Record<number, Student>>({});
  const [fesSupportIds, setFesSupportIds] = useState<number[]>([]);
  const [fesStrikerIds, setFesStrikerIds] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(cdn(`/schaledb.com/${locale}.students.min.json`))
      .then((res): Promise<Record<string, Student> | Student[]> => res.json())
      .then((raw) => {
        if (!alive) return;
        const items = Array.isArray(raw) ? raw : Object.values(raw);
        setStudentInfo(Object.fromEntries(items.map((s) => [s.Id, s])));
        const fesIdsByRole = (tacticRole: string) =>
          items
            .filter((s) => (s.IsLimited ?? []).includes(3) && s.TacticRole === tacticRole)
            .sort((a, b) => (b.DefaultOrder ?? 0) - (a.DefaultOrder ?? 0))
            .map((s) => s.Id);
        setFesSupportIds(fesIdsByRole('Supporter'));
        setFesStrikerIds(fesIdsByRole('DamageDealer'));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [locale]);

  // Renders one PickupStudentIcon from just an id — name/fest/limited/bulletType all come from the
  // studentInfo fetched above, portrait from the shared portrait map. Returns null while either
  // hasn't loaded yet, or if id is null (the dynamic Fes picks resolve after the fetch completes).
  const renderStudentIcon = (id: number | null, ueStar?: number) => {
    if (id === null) return null;
    const info = studentInfo[id];
    if (!info) return null;
    const isFes = (info.IsLimited ?? []).includes(3);
    return (
      <PickupStudentIcon
        key={id}
        studentId={id}
        name={info.Name}
        portrait={portraitMap[id]}
        fest={isFes}
        limited={!isFes && (info.IsLimited ?? []).includes(1)}
        bulletType={info.BulletType}
        ueStar={ueStar}
        locale={locale}
      />
    );
  };

  return (
    <div className="py-4 sm:py-6 px-2 sm:px-4">
      <PageHeader title={loaderData.title} description={t('intro')} />

      <Link to={localeLink(locale, '/planner/gacha')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
        <FaArrowLeft size={11} />
        {t('back_to_planner')}
      </Link>

      <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-2">
        {t('guide_published_label')} <time dateTime={GUIDE_PUBLISHED}>{GUIDE_PUBLISHED}</time> · {t('guide_updated_label')} <time dateTime={GUIDE_LAST_UPDATED}>{GUIDE_LAST_UPDATED}</time>
      </p>

      <div className="mt-6">
        {/* 0. Goal fork */}
        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 mb-6">
          <div className="p-4">
            <div className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">{t('goal.fun_label')}</div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('goal.fun_body')}</p>
          </div>
          <div className="p-4">
            <div className="font-bold text-neutral-900 dark:text-neutral-100 mb-1">{t('goal.raid_label')}</div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('goal.raid_body')}</p>
          </div>
        </div>

        <Section title={t('priority.title')}>
          {/* Prose stays prose: one flowing sentence, same as every other paragraph in this guide. */}
          <p>
            {t('priority.order')}{' '}
            <b className="text-neutral-800 dark:text-neutral-200">
              {t('priority.tier1')} -&gt; {t('priority.tier2')} -&gt; {t('priority.tier3')}
            </b>
          </p>
          {/* Images stay images: a separate gallery block, not woven into the sentence above. Four
              independently labeled rows — Fes support, Fes striker, Kisaki, key supports — each with
              its own list, not merged together. Fes rows are the full current roster, read live from
              student data, not a hand-picked example. */}
          <div className="space-y-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-1.5">{t('priority.tier1')}</div>
              <div className="flex flex-wrap gap-2">{fesSupportIds.map((id) => renderStudentIcon(id))}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-1.5">{t('priority.tier2a')}</div>
              <div className="flex flex-wrap gap-2">{fesStrikerIds.map((id) => renderStudentIcon(id))}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-1.5">{studentInfo[KISAKI_ID]?.Name}</div>
              <div className="flex flex-wrap gap-2">{renderStudentIcon(KISAKI_ID)}</div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-1.5">{t('priority.tier3')}</div>
              <div className="flex flex-wrap items-center gap-2">
                {KEY_SUPPORT_IDS.map((id) => renderStudentIcon(id))}
                <span className="text-neutral-400 dark:text-neutral-600 text-lg font-bold px-1">···</span>
              </div>
            </div>
          </div>
          <Bullets items={[t('priority.normal_dealer'), t('priority.fes_dealer')]} />
          <p>
            {t('priority.ranking_pre')}{' '}
            <Link to={localeLink(locale, '/charts/jp/ranking')} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              {t('priority.ranking_link1')}
            </Link>{' '}
            {t('priority.ranking_mid')}{' '}
            <Link to={localeLink(locale, '/charts/jp/heatmap')} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              {t('priority.ranking_link2')}
            </Link>
            {t('priority.ranking_post')}
          </p>
        </Section>

        <Section title={t('selection_ticket.title')}>
          <Bullets items={[t('selection_ticket.b1'), t('selection_ticket.b2'), t('selection_ticket.b3')]} />
        </Section>

        <Section title={t('eligma.title')}>
          <p>
            <b className="text-neutral-800 dark:text-neutral-200">{t('eligma.warning')}</b>
          </p>
          <p>{t('eligma.detail')}</p>
          <p>{t('eligma.leveling')}</p>
          <p>{t('eligma.exception')}</p>
          <div>{renderStudentIcon(HANAKO_SWIMSUIT_ID, 2)}</div>
        </Section>

        <Section title={t('strategy.title')}>
          <p>{t('strategy.pool')}</p>
          <p>{t('strategy.focus')}</p>
          <p>{t('strategy.fes_400')}</p>
        </Section>

        <Section title={t('charge.title')}>
          <p>{t('charge.status_note')}</p>
          <Bullets items={[t('charge.b1'), t('charge.b2'), t('charge.b3'), t('charge.b4')]} />
        </Section>

        <Section title={t('carryover.title')}>
          <Bullets items={[t('carryover.b1'), t('carryover.b2'), t('carryover.b3')]} />
        </Section>

        <Section title={t('ticket_bonus.title')}>
          <Bullets items={[t('ticket_bonus.b1'), t('ticket_bonus.b2'), t('ticket_bonus.b3'), t('ticket_bonus.b4')]} />
        </Section>

        {/* JP server banners have all crossed the charge-system cutoff (gachaData.ts useChargeSystem),
            so the legacy spark-point exchange never applies there — this section is skipped for ja. */}
        {locale !== 'ja' && (
          <Section title={t('spark.title')}>
            <p>{t('spark.b1')}</p>
            <p>{t('spark.b2')}</p>
          </Section>
        )}

        <Section title={t('free100.title')}>
          <Bullets items={[t('free100.b1'), t('free100.b2')]} />
        </Section>

        <Section title={t('odds.title')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md">
              <thead className="bg-neutral-100 dark:bg-neutral-800">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-700" />
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-700">{t('odds.col_before')}</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-700">{t('odds.col_after')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {oddsRows.map((row) => (
                  <tr key={row}>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-400">{t(`odds.${row}_label`)}</td>
                    <td className="px-3 py-2 tabular-nums text-neutral-800 dark:text-neutral-200">{t(`odds.${row}_before`)}</td>
                    <td className="px-3 py-2 tabular-nums text-neutral-800 dark:text-neutral-200">{t(`odds.${row}_after`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{t('odds.note')}</p>
        </Section>

        <Section title={t('glossary.title')}>
          <dl className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {glossaryKeys.map((key) => (
              <div key={key} className="py-2 sm:grid sm:grid-cols-[8rem_1fr] sm:gap-3">
                <dt className="font-bold text-neutral-800 dark:text-neutral-200">{tDynamic(`glossary.${key}_term`)}</dt>
                <dd className="text-neutral-600 dark:text-neutral-400">{tDynamic(`glossary.${key}_desc`)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t('mapping.title')}>
          <p>{t('mapping.body')}</p>
        </Section>
      </div>
    </div>
  );
}
