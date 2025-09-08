// app/page.tsx
import ClientHeatmapLoader from '@/app/components/heatmap/ClientHeatmapLoader';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

export default function Home() {
  const t = useTranslations('charts.heatmap')
  return (
    <div className="px-4 mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
      <p className="text-sm text-gray-600 mt-1">
        {t('description1')}
      </p>
      <p className="text-sm text-gray-600 mt-1">
        {t('description2')}
      </p>
      
      <Suspense fallback={<p className="text-center text-gray-600">Loading...</p>}>
        <ClientHeatmapLoader />
      </Suspense>
    </div>
  );
}
