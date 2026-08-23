import { DevtoolsDetector, checkers } from 'devtools-detector';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { issuesURL } from '~/data/livedataServer.json';

// performanceChecker is the checker that reliably detects a docked/undocked DevTools
// panel, but it does so by timing console.table()/console.log()/console.clear() on every
// poll tick — which is harmless while DevTools is closed (nothing renders it), but would
// spam the console indefinitely if left running after DevTools opens. We stop the detector
// right after the banner prints once (see below) to bound that to just the open transition.
const devtoolsDetector = new DevtoolsDetector({
  checkers: [checkers.erudaChecker, checkers.elementIdChecker, checkers.devtoolsFormatterChecker, checkers.performanceChecker, checkers.debuggerChecker],
});

let isDevtoolsDetectorInitialized = false;
// Printed at most once per page load, since isOpen can flicker as the panel resizes.
let hasLoggedBanner = false;

// Rough ASCII rendering of the site name, shown alongside the info banner below.
const ASCII_LOGO = `
 __   __                 _____                   _
 \\ \\ / /   _ _____   _  |_   _| __ ___ _ __   __| |___
  \\ V / | | |_  / | | |   | || '__/ _ \\ '_ \\ / _\` / __|
   | || |_| |/ /| |_| |   | || | |  __/ | | | (_| \\__ \\
   |_| \\__,_/___|\\__,_|   |_||_|  \\___|_| |_|\\__,_|___/

`;

export default function Devtoolsdetector() {
  const { t } = useTranslation('common');

  useEffect(() => {
    if (!isDevtoolsDetectorInitialized) {
      devtoolsDetector.addListener((isOpen) => {
        if (isOpen && !hasLoggedBanner) {
          hasLoggedBanner = true;
          console.log(`%c${ASCII_LOGO}`, 'color:#77e0ff; font-family: monospace; white-space: pre;');
          console.log(`${t('devConsole.bugReportNotice', '')} ${issuesURL}`);
          console.log(t('devConsole.hostingNotice'));
          console.log(t('devConsole.analysisNotice'));
          console.log(t('devConsole.cdnUsageNotice'));
          // Stop polling once the banner has printed so performanceChecker's
          // console.table()/console.clear() cycle doesn't keep running afterward.
          devtoolsDetector.stop();
        }
      });
      devtoolsDetector.launch();
      isDevtoolsDetectorInitialized = true;
    }
  }, [t]);

  return null;
}
