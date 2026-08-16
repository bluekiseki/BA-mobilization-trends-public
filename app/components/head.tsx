import { useTranslation } from 'react-i18next';
import type { MetaDescriptor } from 'react-router';
import type { Locale } from '~/utils/i18n/config';
import { domain } from '~/data/livedataServer.json';

export const createMetaDescriptor = (title: string, description: string, image: string = '/example.webp', url?: string) => {
  const absoluteImage = image.startsWith('http') ? image : `https://${domain}${image}`;

  return [
    { title },
    { property: 'og:title', content: title },
    { name: 'twitter:title', content: title },

    { name: 'description', content: description },
    { property: 'og:description', content: description },
    { name: 'twitter:description', content: description },

    { property: 'og:image', content: absoluteImage },
    { name: 'twitter:image', content: absoluteImage },
    { name: 'twitter:card', content: 'summary_large_image' },
    ...(url
      ? [
          { property: 'og:url', content: url },
          { property: 'og:type', content: 'website' },
        ]
      : []),
  ] as MetaDescriptor[];
};

export const createLocalizedUrl = (locale: Locale, path: string) => {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  return `https://${domain}${localePrefix}${path}`;
};

interface LinkHreflang {
  rel: 'alternate';
  hrefLang: Locale | 'x-default';
  href: string;
}
export const createLinkHreflang: (path: string) => LinkHreflang[] = (path: string) => {
  return [
    {
      rel: 'alternate',
      hrefLang: 'en',
      href: createLocalizedUrl('en', path),
    },
    {
      rel: 'alternate',
      hrefLang: 'ko',
      href: createLocalizedUrl('ko', path),
    },
    {
      rel: 'alternate',
      hrefLang: 'ja',
      href: createLocalizedUrl('ja', path),
    },
    {
      rel: 'alternate',
      hrefLang: 'zh-Hant',
      href: createLocalizedUrl('zh-Hant', path),
    },
    {
      rel: 'alternate',
      hrefLang: 'x-default',
      href: createLocalizedUrl('en', path),
    },
  ];
};

export const Title = () => {
  // const {t} = useTranslation(undefined, { keyPrefix: 'home' });
  const { t } = useTranslation('common');

  return (
    <>
      <meta property="og:site_name" content={t('title')} />
    </>
  );
};

export const NoScript = () => {
  // const {t} = useTranslation(undefined, { keyPrefix: 'home' });
  const { t } = useTranslation('common');
  return (
    <noscript>
      <div className="fixed inset-0 z-9999 flex items-center justify-center bg-neutral-100 bg-opacity-90 text-neutral-800 p-5 box-border">
        <div className="text-center max-w-lg">
          <h2 className="text-3xl font-bold mb-4">{t('js-disable')} ⚠️</h2>
          <p className="text-lg mb-3">{t('js-disable-description')}</p>
        </div>
      </div>
    </noscript>
  );
};
