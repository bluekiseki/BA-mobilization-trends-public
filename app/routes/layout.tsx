// app/routes/layout.tsx
import { Outlet, data } from 'react-router';
import type { Route } from './+types/layout'; // React Router v7 type auto-generation
import { SUPORTED_LOCALES } from '../utils/i18n/config'; // List of supported languages

export async function loader({ params }: Route.LoaderArgs) {
  const { locale } = params;

  // If a locale parameter is present but the language is not supported, return 404
  if (locale && !SUPORTED_LOCALES.includes(locale as any)) {
    throw data(null, { status: 404 });
  }

  return {};
}

export default function Layout() {
  return <Outlet />;
}
