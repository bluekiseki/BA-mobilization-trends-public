import Link from 'next/link';
import { useTranslations } from 'next-intl';
// import { useRouter } from 'next/router'

export default function Home() {
  const t = useTranslations('home');
  // const router = useRouter()
  // console.log('router.locale',router.locale)

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <div className="w-full m-auto max-w-xl text-center bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-4 transition-colors duration-300">
          {t('title')}
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 transition-colors duration-300">
          {t('description')}
        </p>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 transition-colors duration-300">
          {t('last-update')} 2025-08-09
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/charts/ranking" className="w-full sm:w-auto px-6 py-3 text-lg font-semibold text-gray-800 bg-bluearchive-botton-yellow  rounded-lg shadow-md hover:bg-yellow-200  transition-colors duration-300">
            {t('btn2')}
          </Link>
          <Link href="/charts/heatmap" className="w-full sm:w-auto px-6 py-3 text-lg font-semibold text-black  bg-bluearchive-botton-blue rounded-lg shadow-md hover:bg-sky-200 transition-colors duration-300">
            {t('btn1')}
          </Link>
        </div>
      </div>
    </div>
  );
}