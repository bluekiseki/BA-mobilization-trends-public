import { useRef, useState, type RefObject } from 'react';
import { redirect, Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FaGithub } from 'react-icons/fa6';
import type { Route } from './+types/signup';
import { MagicLinkForm } from '~/features/account/components/MagicLinkForm';
import { SignupForm } from '~/features/account/components/SignupForm';
import { GithubButton } from '~/features/account/components/GithubButton';
import { focusField } from '~/features/account/logic/focusField';
import { AUTH_ALT_BUTTON_CLASS } from '~/features/account/components/authButtonStyles';
import { localeLink } from '~/utils/localeLink';
import { magicLinkLogin } from '~/data/livedataServer.json';
import { env } from 'cloudflare:workers';
import { ClientOnly } from '~/components/common/ClientOnly';
import { getInstance } from '~/middleware/i18next';
import { createMetaDescriptor, createLinkHreflang } from '~/components/shell/head';
import { createInternalSessionRequest } from '~/utils/internalSessionRequest';

export async function loader({ context, request, params }: Route.LoaderArgs) {
  try {
    const resp = await env.AUTH_WORKER.fetch(createInternalSessionRequest(request, params.locale));
    if (resp.status === 200) return redirect(localeLink(params.locale, '/settings'));
  } catch {}
  const i18n = getInstance(context);
  return {
    pageTitle: `${i18n.t('auth:common.createAccount')} - Yuzu Trends`,
  };
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.pageTitle ?? 'Create account - Yuzu Trends';
  return createMetaDescriptor(title, '');
}

export function links() {
  return createLinkHreflang('/signup');
}

type Step = 'choose' | 'password' | 'github' | 'magic';

export default function SignupPage() {
  const { t } = useTranslation('auth');
  const { locale } = useParams();
  const [step, setStep] = useState<Step>('choose');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [showConsentError, setShowConsentError] = useState(false);
  const termsRef = useRef<HTMLInputElement>(null);
  const privacyRef = useRef<HTMLInputElement>(null);

  const consentGiven = agreedTerms && agreedPrivacy;

  // Shows the consent error and (optionally) moves focus to the first unchecked box
  const requireConsent = ({ focus = true }: { focus?: boolean } = {}) => {
    if (consentGiven) return true;
    setShowConsentError(true);
    if (focus) focusField(agreedTerms ? privacyRef.current : termsRef.current);
    return false;
  };

  const consent = (
    <SignupConsent
      agreedTerms={agreedTerms}
      agreedPrivacy={agreedPrivacy}
      onTermsChange={(v) => {
        setAgreedTerms(v);
        if (v && agreedPrivacy) setShowConsentError(false);
      }}
      onPrivacyChange={(v) => {
        setAgreedPrivacy(v);
        if (v && agreedTerms) setShowConsentError(false);
      }}
      showError={showConsentError && !consentGiven}
      termsRef={termsRef}
      privacyRef={privacyRef}
    />
  );

  const goTo = (next: Step) => {
    setShowConsentError(false);
    setStep(next);
  };

  return (
    <div className="min-h-screen flex justify-center px-4 pt-8 sm:pt-16 pb-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">{t('common.createAccount')}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('signup.benefits.dataSync')} {t('signup.benefits.noLoginNote')}
          </p>
        </div>

        <div className="sm:bg-white sm:dark:bg-neutral-800 sm:rounded-lg sm:border sm:border-neutral-200 sm:dark:border-neutral-700 overflow-hidden">
          <div className="sm:p-6 space-y-5">
            {step === 'choose' ? (
              <div className="space-y-3">
                <button type="button" onClick={() => goTo('password')} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition">
                  {t('signup.start.password')}
                </button>
                <button type="button" onClick={() => goTo('github')} className={AUTH_ALT_BUTTON_CLASS}>
                  <FaGithub size={18} />
                  {t('signup.start.github')}
                </button>
                {magicLinkLogin && (
                  <button type="button" onClick={() => goTo('magic')} className={AUTH_ALT_BUTTON_CLASS}>
                    {t('signup.start.magic')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <button type="button" onClick={() => goTo('choose')} className="text-sm text-neutral-500 dark:text-neutral-400 hover:underline">
                  {t('signup.back')}
                </button>
                {step === 'password' && (
                  <ClientOnly>
                    <SignupForm consent={consent} requireConsent={requireConsent} />
                  </ClientOnly>
                )}
                {step === 'magic' && <MagicLinkForm consent={consent} requireConsent={requireConsent} />}
                {step === 'github' && (
                  <div className="space-y-4">
                    {consent}
                    <GithubButton beforeStart={requireConsent} />
                  </div>
                )}
              </>
            )}

            <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center">
              {t('common.haveAccount')}{' '}
              <Link to={localeLink(locale, '/login')} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                {t('common.logIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SignupConsentProps {
  agreedTerms: boolean;
  agreedPrivacy: boolean;
  onTermsChange: (value: boolean) => void;
  onPrivacyChange: (value: boolean) => void;
  showError: boolean;
  termsRef: RefObject<HTMLInputElement | null>;
  privacyRef: RefObject<HTMLInputElement | null>;
}

function SignupConsent({ agreedTerms, agreedPrivacy, onTermsChange, onPrivacyChange, showError, termsRef, privacyRef }: SignupConsentProps) {
  const { t } = useTranslation('auth');
  const checkboxClass = 'mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 focus:ring-blue-500';
  return (
    <div className="space-y-2">
      <p className="text-sm text-amber-600 dark:text-amber-400">{t('signup.benefits.unstableWarning')}</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input ref={termsRef} type="checkbox" checked={agreedTerms} onChange={(e) => onTermsChange(e.target.checked)} aria-invalid={showError && !agreedTerms} className={checkboxClass} />
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('signup.termsConsent')}{' '}
          <Link to="/terms" target="_blank" className="text-blue-500 hover:underline">
            {t('signup.termsOfService')}
          </Link>
          .
        </span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <input ref={privacyRef} type="checkbox" checked={agreedPrivacy} onChange={(e) => onPrivacyChange(e.target.checked)} aria-invalid={showError && !agreedPrivacy} className={checkboxClass} />
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('signup.privacyConsent')}{' '}
          <Link to="/privacy" target="_blank" className="text-blue-500 hover:underline">
            {t('signup.privacyPolicy')}
          </Link>
          {t('signup.privacyNote')}
        </span>
      </label>
      {showError && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {t('signup.consentRequired')}
        </p>
      )}
    </div>
  );
}
