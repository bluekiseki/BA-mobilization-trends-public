import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/terms';
import ContactButton from '~/components/ContactButton';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({ title: i18n.t('common:title') });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = 'Terms of Service - ' + loaderData.title;
  return [{ title }, { property: 'og:title', content: title }];
}

const EFFECTIVE_DATE = 'May 19, 2026';

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mb-10 scroll-mt-16">
    <h2 className="text-2xl font-bold text-neutral-800 dark:text-white mb-4 border-b border-neutral-200 dark:border-neutral-700 pb-2">{title}</h2>
    {children}
  </section>
);

const P = ({ children }: { children: React.ReactNode }) => <p className="text-neutral-600 dark:text-neutral-400 mb-3 leading-relaxed">{children}</p>;

const Ul = ({ children }: { children: React.ReactNode }) => <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-400 pl-2 mb-3">{children}</ul>;

export default function TermsPage() {
  return (
    <div className="font-pretendard">
      <h1 className="text-3xl md:text-4xl font-bold text-neutral-800 dark:text-white mb-2 border-b border-neutral-300 dark:border-neutral-600 pb-4">Terms of Service</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">Effective Date: {EFFECTIVE_DATE}</p>

      <div className="mb-8 p-4 bg-amber-50 border-l-4 border-amber-400 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 rounded-md">
        <p className="font-bold mb-1">Unofficial Fan Site</p>
        <p className="text-sm">
          This website is an independent, unofficial fan tool for the mobile game <b>Blue Archive</b>. It has no affiliation with, is not endorsed by, and is not connected to NEXON Korea Corp., NEXON
          GAMES Co., Ltd., or YOSTAR, Inc. All Blue Archive trademarks and copyrights belong to their respective owners.
        </p>
      </div>

      <Section id="s1" title="1. Acceptance of Terms">
        <P>By accessing or using this website ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</P>
      </Section>

      <Section id="s2" title="2. Description of Service">
        <P>The Service provides free, browser-based tools for players of Blue Archive, including:</P>
        <Ul>
          <li>Raid statistics and team composition analysis</li>
          <li>Event, equipment, and student growth planners</li>
          <li>Gacha (pyroxene) income simulation</li>
          <li>In-game calendar and notices viewer</li>
          <li>Cloud sync for planner data (for registered users)</li>
        </Ul>
        <P>The Service is provided free of charge. We reserve the right to modify or discontinue any feature at any time.</P>
      </Section>

      <Section id="s3" title="3. User Accounts">
        <P>Account registration is optional. If you create an account:</P>
        <Ul>
          <li>You may use a username that does not reveal your real identity. A real name or email address is not required.</li>
          <li>You are responsible for maintaining the confidentiality of your credentials.</li>
          <li>
            Each account may have up to <b>5 profiles</b>, intended for managing different server accounts (e.g., JP and KR).
          </li>
          <li>
            You may delete your account at any time. All associated data is <b>immediately and permanently deleted</b> upon account deletion and cannot be recovered.
          </li>
        </Ul>
        <P>You may not create accounts for others without their consent, or use automated means to create accounts in bulk.</P>
      </Section>

      <Section id="s4" title="4. User Content and Data">
        <P>
          Planner data you create (growth plans, equipment schedules, etc.) belongs to you. By syncing it to our servers, you grant us a limited license to store and transmit that data solely for the
          purpose of providing the sync feature.
        </P>
        <P>You can export your data at any time and delete it by deleting your account.</P>
      </Section>

      <Section id="s5" title="5. Prohibited Uses">
        <P>You agree not to:</P>
        <Ul>
          <li>Use the Service for any unlawful purpose.</li>
          <li>Attempt to gain unauthorized access to other users' accounts or our infrastructure.</li>
          <li>Scrape or harvest data from the Service in a way that burdens our infrastructure.</li>
          <li>Reverse-engineer or exploit the Service to gain competitive advantage over other users.</li>
          <li>Upload content that is harmful, offensive, or infringes third-party intellectual property.</li>
        </Ul>
      </Section>

      <Section id="s6" title="6. Intellectual Property">
        <P>
          All Blue Archive game assets, characters, trademarks, and related intellectual property are owned by NEXON Korea Corp., NEXON GAMES Co., Ltd., and YOSTAR, Inc. This site uses game assets in
          good faith for fan purposes and does not claim ownership.
        </P>
        <P>
          The original source code of this website is distributed under the MIT License. See the{' '}
          <a href="/source" className="text-blue-500 hover:underline">
            License & Data Sources
          </a>{' '}
          page for details.
        </P>
      </Section>

      <Section id="s7" title="7. Disclaimer of Warranties">
        <P>
          The Service is provided <b>"as is"</b> and <b>"as available"</b> without warranties of any kind. We do not guarantee that the Service will be uninterrupted, error-free, or that game data
          displayed is accurate or up to date. Use of the Service is at your own risk.
        </P>
      </Section>

      <Section id="s8" title="8. Limitation of Liability">
        <P>
          To the maximum extent permitted by applicable law, the operator shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service,
          including loss of data.
        </P>
      </Section>

      <Section id="s9" title="9. Changes to These Terms">
        <P>
          We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the revised Terms. Significant changes will be reflected with an updated effective
          date.
        </P>
      </Section>

      <Section id="s10" title="10. Contact">
        <P>
          Questions about these Terms? Please use the{' '}
          <a className="text-blue-500 hover:underline cursor-pointer">
            <ContactButton>contact form</ContactButton>
          </a>
          .
        </P>
      </Section>
    </div>
  );
}
