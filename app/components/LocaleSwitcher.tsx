import {useLocale, useTranslations} from 'next-intl';
import LocaleSwitcherSelect from './LocaleSwitcherSelect';

export default function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();

  return (
    <LocaleSwitcherSelect
      defaultValue={locale}
      items={[
        {
          value: 'en',
          label: 'English'
        },
        {
          value: 'ko',
          label: '한국어'
        },
        {
          value: 'ja',
          label: '日本語'
        }
      ]}
      label={t('label')}
    />
  );
}
