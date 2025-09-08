
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { getLocale } from 'next-intl/server';
import './globals.css';
import Devtoolsdetector from './components/devtools-detector';
import { ThemeProvider, ThemeSwitcher } from './components/ThemeToggleButton';
import { Navigation } from './components/Navigation'


const Title = () => {

  const t = useTranslations('home');
  return <>
    <title>{t('site-title')}</title>
    <meta name="description" content={t('description')}></meta>
    <meta property="og:title" content={t('title')} />
    <meta property="og:description" content={t('description')} />
    <meta property="og:image" content="/example.webp" />
  </>
}

const NoScript = () => {
  const t = useTranslations('home');
  return <noscript>
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-100 bg-opacity-90 text-gray-800 p-5 box-border">
      <div className="text-center max-w-lg">
        <h2 className="text-3xl font-bold mb-4">{t('js-disable')} ⚠️</h2>
        <p className="text-lg mb-3">
          {t('js-disable-description')}
        </p>
      </div>
    </div>
  </noscript>
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // const { darkMode } = useThemeStore();
  const locale = await getLocale()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Title />
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              const theme = localStorage.getItem('theme');
              const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              if (isDark) {
                document.documentElement.classList.add('dark');
                console.log('dark')
              }
            } catch (e) {}
          `,
        }} />
      </head>
      <body>
        <Devtoolsdetector />
        <NextIntlClientProvider>
          <ThemeProvider>



            <div className="bg-gray-50 text-gray-800 dark:bg-gray-900 dark:text-white transition-colors duration-300">
              <header className="bg-white dark:bg-gray-800 shadow-sm p-4 sticky top-0 z-50 transition-colors duration-300">
                <Navigation />
              </header>

              <main className="max-w-7xl mx-auto py-8" style={{ minHeight: "calc(100vh - 160px)" }}>
                {children}
              </main>

              <footer className="mt-auto py-4 text-center text-gray-500 dark:text-gray-400 text-sm border-t border-gray-200 dark:border-gray-700 transition-colors duration-300">
                <p>This is just a non-commercial fan site,</p>
                <p> And all copyright of <a href='https://bluearchive.jp/'><b className='hover:underline'>&apos;Blue Archive&rsquo;</b></a> belongs to <a href='https://www.nexongames.co.kr/'><b className='hover:underline'>Nexon Games Co., Ltd.</b></a> & <a href="https://www.yo-star.com"><b className='hover:underline'>YOSTAR, Inc.</b></a> </p>
                <p>Raid/Student data was collected at <a className='hover:underline' href='https://arona.ai' ><b>Arona.AI</b></a> & <a className='hover:underline' href='https://schaledb.com'><b>Schale DB</b></a></p>
              </footer>
            </div>
          </ThemeProvider>
        </NextIntlClientProvider>


        <NoScript />

      </body>
    </html>
  );
}