import { useTranslation } from 'react-i18next';
import type { MetaDescriptor } from 'react-router';
import type { Locale } from '~/utils/i18n/config';
import { domain } from '~/data/livedataServer.json';

export const createMetaDescriptor = (title: string, description: string, iamge: string = '/example.webp') => {
  return [
    { title },
    { property: 'og:title', content: title },
    { property: 'twitter:title', content: title },

    { name: 'description', content: description },
    { property: 'og:description', content: description },
    { property: 'twitter:description', content: description },

    { property: 'og:image', content: iamge },
    { property: 'twitter:image', content: iamge },
    { property: 'twitter:card', content: iamge },
  ] as MetaDescriptor[];
};

interface LinkHreflang {
  rel: 'alternate';
  hrefLang: Locale | 'x-default';
  href: string;
}
export const createLinkHreflang: (path: string) => LinkHreflang[] = (path: string) => {
  const domain_name = `https://${domain}`;
  return [
    {
      rel: 'alternate',
      hrefLang: 'en',
      href: `${domain_name}${path}`,
    },
    {
      rel: 'alternate',
      hrefLang: 'ko',
      href: `${domain_name}/ko${path}`,
    },
    {
      rel: 'alternate',
      hrefLang: 'ja',
      href: `${domain_name}/ja${path}`,
    },
    {
      rel: 'alternate',
      hrefLang: 'x-default',
      href: `${domain_name}${path}`,
    },
  ];
};

export const Title = () => {
  // const {t} = useTranslation(undefined, { keyPrefix: 'home' });
  const { t } = useTranslation('home');

  return (
    <>
      <meta property="og:site_name" content={t('title')} />
      <meta property="og:url" content={`https://${domain}`} />
    </>
  );
};

export const NoScript = () => {
  // const {t} = useTranslation(undefined, { keyPrefix: 'home' });
  const { t } = useTranslation('home');
  return (
    <noscript>
      <div className="fixed inset-0 z-9999 flex items-center justify-center bg-gray-100 bg-opacity-90 text-gray-800 p-5 box-border">
        <div className="text-center max-w-lg">
          <h2 className="text-3xl font-bold mb-4">{t('js-disable')} ⚠️</h2>
          <p className="text-lg mb-3">{t('js-disable-description')}</p>
        </div>
      </div>
    </noscript>
  );
};
