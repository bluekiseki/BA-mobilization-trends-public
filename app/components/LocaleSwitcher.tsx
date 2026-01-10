import { useTranslation } from 'react-i18next';
import LocaleSwitcherSelect from './LocaleSwitcherSelect';

export default function LocaleSwitcher() {
  // const {t, i18n} = useTranslation('LocaleSwitcher');
  const { t, i18n } = useTranslation("LocaleSwitcher");
  const locale = i18n.language

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
        },
        {
          value: 'zh-Hant',
          label: '繁體中文'
        }
      ]}
      label={t('label')}
    />
  );
}
