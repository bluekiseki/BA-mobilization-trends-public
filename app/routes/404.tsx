import { useTranslation } from 'react-i18next';
import type { Route } from './+types/404';
import { data } from 'react-router';

export function loader({ params: _ }: Route.ActionArgs) {
  throw data(null, { status: 404 });
}

export const action = () => null;

export default function NoMatch() {
  const { t } = useTranslation('common');
  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>404</h1>
      <p>{t('404_not_found')}</p>
    </main>
  );
}
