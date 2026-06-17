import { data, type LoaderFunctionArgs } from 'react-router';
import { getInstance } from '~/middleware/i18next';
import type { Route } from './+types/privacy';
import ContactButton from '~/components/ContactButton';

export function loader({ context }: LoaderFunctionArgs) {
  const i18n = getInstance(context);
  return data({ title: i18n.t('common:title') });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = 'Privacy Policy - ' + loaderData.title;
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

const RegionBox = ({ flag, region, law, children }: { flag: string; region: string; law: string; children: React.ReactNode }) => (
  <div className="mt-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-md">
    <p className="font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
      {flag} {region} — <span className="font-normal text-sm text-neutral-500 dark:text-neutral-400">{law}</span>
    </p>
    <div className="text-sm text-neutral-600 dark:text-neutral-400">{children}</div>
  </div>
);

export default function PrivacyPage() {
  return (
    <div className="font-pretendard">
      <h1 className="text-3xl md:text-4xl font-bold text-neutral-800 dark:text-white mb-2 border-b border-neutral-300 dark:border-neutral-600 pb-4">Privacy Policy</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">Effective Date: {EFFECTIVE_DATE}</p>
      <div className="mb-6 p-3 bg-blue-50 border-l-4 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-sm rounded">
        The English version of this Privacy Policy is the authoritative original. Other language summaries are provided for convenience and do not supersede the English text.
        <br />이 개인정보 처리방침의 영어 원문이 공식 문서입니다. 한국어 요약은 참고용이며 원문에 우선하지 않습니다.
      </div>

      <nav className="mb-8 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg text-sm">
        <p className="font-semibold text-neutral-700 dark:text-neutral-300 mb-2">Contents</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-600 dark:text-blue-400">
          {[
            'Who We Are',
            'What We Collect',
            'How We Use Your Data',
            'Third-Party Services',
            'Data Retention',
            'Your Rights',
            'Cross-Border Data Transfers',
            'Region-Specific Provisions',
            'Contact Us',
          ].map((s, i) => (
            <li key={i}>
              <a href={`#s${i + 1}`} className="hover:underline">
                {s}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="s1" title="1. Who We Are">
        <P>
          This website is an unofficial fan-made tool for the mobile game <b>Blue Archive</b>. It is not affiliated with, endorsed by, or connected to NEXON Korea Corp., NEXON GAMES Co., Ltd., or
          YOSTAR, Inc.
        </P>
        <P>
          For contact, please use the{' '}
          <a className="text-blue-500 hover:underline cursor-pointer">
            <ContactButton>contact form</ContactButton>
          </a>
          .
        </P>
      </Section>

      <Section id="s2" title="2. What We Collect">
        <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-2">2a. Anonymous visitors (no account)</h3>
        <P>When you visit without an account, we do not collect any personally identifiable information directly. However, the following technical data is collected:</P>
        <Ul>
          <li>
            <b>IP address</b> — processed by Cloudflare as part of hosting infrastructure (visible in Workers logs). If you make authentication-related requests (login, signup), your IP is also
            temporarily stored in our database for rate-limiting purposes and expires after 24 hours.
          </li>
          <li>
            <b>PostHog analytics</b> — records anonymous usage events (page views, feature interactions) <b>without cookies and without persistent identifiers</b>. In addition to standard HTTP request
            data, PostHog also captures screen resolution, country (via GeoIP lookup), JavaScript exceptions, and page performance metrics.
          </li>
        </Ul>

        <h3 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-2 mt-4">2b. Registered users (when account features are available)</h3>
        <P>If you create an account, we may collect:</P>
        <Ul>
          <li>
            <b>Username</b> — required, chosen by you. No real name or identity required.
          </li>
          <li>
            <b>Email address</b> — optional. Only collected if you choose email-based login or magic link.
          </li>
          <li>
            <b>Passkey credential public key</b> — if you register a passkey. The private key never leaves your device.
          </li>
          <li>
            <b>Game planner data</b> — student growth plans, equipment plans, event plans, gacha strategies, and similar data you create using this site's tools. This data is stored on our servers
            only when you choose to sync it.
          </li>
          <li>
            <b>Session token</b> — stored in a secure HTTP-only cookie to maintain your login state.
          </li>
        </Ul>
        <P>We do not collect payment information, real names, phone numbers, or government IDs.</P>
        <P>
          <b>Children's Privacy:</b> This service is not directed at children under 14 years of age (or under 13 in the United States). We do not knowingly collect personal data from minors. If we
          learn that personal data has been collected from a child below the applicable age threshold, we will delete it promptly. If you believe a minor has submitted personal data, please contact us
          via the contact form.
        </P>
      </Section>

      <Section id="s3" title="3. How We Use Your Data">
        <Ul>
          <li>To authenticate your account and maintain your session.</li>
          <li>To store and sync your game planner data across devices (if you opt in).</li>
          <li>To send a magic link email (only if you request one).</li>
          <li>To apply rate limiting on authentication endpoints (IP address, 24-hour window).</li>
          <li>To operate and improve the service.</li>
        </Ul>
        <P>We do not sell, rent, or share your personal data with third parties for marketing purposes.</P>
      </Section>

      <Section id="s4" title="4. Third-Party Services">
        <P>The following third-party services are used and may collect technical data (IP address, user-agent, page views, etc.):</P>
        <Ul>
          <li>
            <b>Cloudflare Pages / Workers</b> — hosting and infrastructure. Standard request data including IP addresses is visible in Cloudflare Workers logs. We additionally store IP addresses in
            our database (Cloudflare D1) for authentication rate limiting; these entries have a 24-hour rolling window.
          </li>
          <li>
            <b>Cloudflare D1</b> — database for user accounts and synced planner data.
          </li>
          <li>
            <b>PostHog</b> — privacy-friendly analytics. Cookie tracking is disabled; only anonymous usage events are recorded.
          </li>
          <li>
            <b>Resend</b> — transactional email delivery. Used to send magic link login emails and email verification emails. Only the recipient email address and message content are transmitted.
          </li>
          <li>
            <b>Web3Forms</b> — processes submissions from the contact form.
          </li>
        </Ul>
        <P>Each third-party service has its own privacy policy. We are not responsible for their data practices.</P>
      </Section>

      <Section id="s5" title="5. Data Retention">
        <Ul>
          <li>Account data and synced planner data are retained until you delete your account.</li>
          <li>Session tokens expire after 7 days of inactivity (better-auth default; no custom value is configured).</li>
          <li>
            Deleted account data is <b>immediately and permanently purged</b> upon account deletion. There is no grace period or recovery.
          </li>
          <li>IP addresses stored for rate limiting use a 24-hour rolling window; entries are not automatically purged from the database but become inert after the window expires.</li>
          <li>Anonymous analytics data (PostHog) is retained per PostHog's own retention policy.</li>
        </Ul>
      </Section>

      <Section id="s6" title="6. Your Rights">
        <P>Regardless of your location, you have the right to:</P>
        <Ul>
          <li>
            <b>Access</b> — request a copy of the personal data we hold about you.
          </li>
          <li>
            <b>Correction</b> — request correction of inaccurate data.
          </li>
          <li>
            <b>Deletion</b> — delete your account directly in <b>Settings → Delete account</b>. All associated data is immediately and permanently removed. No contact required.
          </li>
          <li>
            <b>Data portability</b> — export your planner data as JSON at any time via the export button in the planner tools. No contact required.
          </li>
        </Ul>
        <P>
          For rights that cannot be exercised in-app, use the{' '}
          <a className="text-blue-500 hover:underline cursor-pointer">
            <ContactButton>contact form</ContactButton>
          </a>
          . Requests will be responded to within 30 days.
        </P>
      </Section>

      <Section id="s7" title="7. Cross-Border Data Transfers">
        <P>
          This service is operated by an independent operator and uses infrastructure provided by Cloudflare, Inc. (headquartered in the United States) and PostHog, Inc. (United States). As a result,
          personal data you provide may be <b>transferred to and processed in the United States</b> or other countries where Cloudflare operates data centers.
        </P>
        <P>
          Cloudflare applies standard contractual clauses and other appropriate safeguards for international data transfers. PostHog does not receive personally identifiable information from this
          site.
        </P>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md">
            <thead className="bg-neutral-100 dark:bg-neutral-800">
              <tr>
                {['Recipient', 'Country', 'Purpose', 'Data transferred', 'Safeguards'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-neutral-700 dark:text-neutral-300 border-b border-neutral-200 dark:border-neutral-700">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-neutral-600 dark:text-neutral-400 divide-y divide-neutral-200 dark:divide-neutral-700">
              <tr>
                <td className="px-3 py-2">Cloudflare, Inc.</td>
                <td className="px-3 py-2">USA (global CDN)</td>
                <td className="px-3 py-2">Hosting, database, CDN</td>
                <td className="px-3 py-2">Username, email (if provided), planner data, session token</td>
                <td className="px-3 py-2">Standard Contractual Clauses (SCC); Cloudflare DPA</td>
              </tr>
              <tr>
                <td className="px-3 py-2">PostHog, Inc.</td>
                <td className="px-3 py-2">USA</td>
                <td className="px-3 py-2">Analytics</td>
                <td className="px-3 py-2">Anonymous usage events only (no PII)</td>
                <td className="px-3 py-2">No PII transmitted; cookieless, identifier-free</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Resend, Inc.</td>
                <td className="px-3 py-2">USA</td>
                <td className="px-3 py-2">Transactional email (magic link, email verification)</td>
                <td className="px-3 py-2">Recipient email address and email content only (only when you request a magic link or email verification)</td>
                <td className="px-3 py-2">Resend Privacy Policy; data processed only on your explicit request</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Web3Forms</td>
                <td className="px-3 py-2">USA</td>
                <td className="px-3 py-2">Contact form delivery</td>
                <td className="px-3 py-2">Email and message content (contact form only)</td>
                <td className="px-3 py-2">Web3Forms Privacy Policy</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed">
          한국어 요약 — 이 서비스는 미국 소재 Cloudflare Inc.의 인프라를 사용합니다. 회원가입 시 입력한 사용자명·이메일(선택)·플래너 데이터가 미국 서버에 저장될 수 있습니다. Cloudflare는 표준 계약
          조항(SCC)을 통해 적절한 보호 조치를 적용합니다. PostHog에는 개인식별정보가 전송되지 않습니다. 이메일 기반 인증(매직 링크, 이메일 인증)을 요청한 경우에 한해 미국 소재 Resend Inc.에 이메일
          주소가 전송됩니다.
        </p>
      </Section>

      <Section id="s8" title="8. Region-Specific Provisions">
        <RegionBox flag="🇪🇺" region="European Union / EEA" law="General Data Protection Regulation (GDPR)">
          <p>
            This service is <b>not directed at residents of the European Union or European Economic Area</b> and does not fall within the scope of the GDPR. If you are located in the EU/EEA, you use
            this service on a voluntary basis and no GDPR-specific data processing agreement is in place. We recommend EU/EEA residents consider this before creating an account.
          </p>
        </RegionBox>

        <RegionBox flag="🇺🇸" region="United States" law="CCPA / CPRA (California)">
          <p className="mb-2">California residents have the right to:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 mb-2">
            <li>Know what personal information is collected and how it is used.</li>
            <li>Request deletion of their personal information.</li>
            <li>Opt out of the "sale" or "sharing" of personal information.</li>
          </ul>
          <p>
            <b>We do not sell or share personal information</b> with third parties for cross-context behavioral advertising. To submit a verifiable consumer request, use the contact form.
          </p>
        </RegionBox>

        <RegionBox flag="🇰🇷" region="Republic of Korea" law="Personal Information Protection Act (PIPA, 개인정보 보호법)">
          <p className="mb-2">한국 이용자는 개인정보 보호법 제15조~제39조에 따라 다음 권리를 보유합니다:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 mb-2">
            <li>개인정보 처리에 대한 동의 및 동의 철회 (제15조, 제37조)</li>
            <li>개인정보 열람 요구 (제35조)</li>
            <li>개인정보 정정·삭제 요구 (제36조)</li>
            <li>개인정보 처리 정지 요구 (제37조)</li>
          </ul>
          <p className="mb-2">
            수집 항목: 사용자명(필수), 이메일(선택), 패스키 공개키(선택), 플래너 데이터(선택), 세션 토큰. 보유기간: 계정 삭제 시까지. 파기방법: 계정 삭제 즉시 데이터베이스에서 영구 삭제(복구 불가).
            권리 행사: 계정 삭제 및 데이터 내보내기는 서비스 내 설정 메뉴에서 직접 수행할 수 있습니다. 그 외 문의는 문의 양식을 통해 요청하시기 바랍니다.
          </p>
          <p className="mb-2">
            <b>개인정보 보호책임자 (제31조):</b> 책임자 성명 및 연락처는 비공개이나, 개인정보 보호 관련 요청 시 문의 양식을 통해 지체 없이 제공합니다.
          </p>
          <p>
            <b>개인정보 국외 이전:</b> 본 서비스는 미국 소재 Cloudflare, Inc. 및 Resend, Inc.의 서버를 이용합니다. 이에 따라 수집된 개인정보가 미국으로 이전될 수 있으며, Cloudflare는 표준 계약
            조항(SCC)을 통해 적절한 보호 조치를 취하고 있습니다. Resend는 이메일 기반 인증 요청 시에만 이메일 주소를 수신합니다. 이에 동의하지 않을 경우 회원가입을 하지 않으셔도 됩니다(비회원으로
            서비스 이용 가능).
          </p>
        </RegionBox>

        <RegionBox flag="🇯🇵" region="Japan" law="Act on the Protection of Personal Information (APPI, 個人情報の保護に関する法律) 2022">
          <p className="mb-2">日本のご利用者の皆様へ:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 mb-2">
            <li>利用目的: アカウント認証、プランナーデータの同期、サービスの運営改善</li>
            <li>第三者提供: マーケティング目的での第三者提供は行いません</li>
            <li>開示・訂正・利用停止・削除: サービス内の設定画面から直接実行するか、お問い合わせフォームからご請求ください</li>
          </ul>
          <p className="mb-2">
            <b>個人情報取扱事業者:</b> 事業者名および連絡先は非公開ですが、個人情報に関するご請求があった際にお問い合わせフォームを通じて遅滞なく提供いたします。
          </p>
          <p>
            個人データは米国に所在する Cloudflare, Inc. および Resend, Inc. のサーバーに転送・処理される場合があります。Cloudflare は標準契約条項（SCC）等の適切な保護措置を講じています。詳細は上記「7.
            Cross-Border Data Transfers」をご参照ください。
          </p>
        </RegionBox>

        <RegionBox flag="🇹🇼" region="Taiwan" law="Personal Data Protection Act (PDPA, 個人資料保護法)">
          <p className="mb-2">台灣使用者之相關資訊:</p>
          <ul className="list-disc list-inside space-y-1 pl-2 mb-2">
            <li>蒐集目的: 帳號驗證與遊戲規劃工具之資料同步</li>
            <li>資料類別: C001（辨識個人者：使用者名稱）、C002（辨識財務者：無）</li>
            <li>當事人權利: 依第3條，您有查詢、閱覽、複製、補充、更正、停止蒐集、刪除之權利</li>
          </ul>
          <p>請透過聯絡表單提出申請。</p>
        </RegionBox>
      </Section>

      <Section id="s9" title="9. Contact Us">
        <P>
          For privacy-related requests, questions, or concerns, please use the{' '}
          <a className="text-blue-500 hover:underline cursor-pointer">
            <ContactButton>contact form</ContactButton>
          </a>
          . We aim to respond within 30 days.
        </P>
        <P>This policy may be updated. Significant changes will be noted with a revised effective date.</P>
      </Section>
    </div>
  );
}
